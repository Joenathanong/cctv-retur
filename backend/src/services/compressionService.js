'use strict';

/**
 * compressionService — Post-process video compression worker.
 *
 * Flow:
 *   1. scan() dipanggil oleh cron setiap N menit (default 5 menit)
 *   2. Scan semua .ts file yang BUKAN segment aktif & belum bermarker .compressed
 *   3. Antri file ke _queue, proses satu per satu di background
 *   4. Setiap file: compress → replace original → buat sidecar .compressed
 *   5. Jika gagal: log error, skip, coba lagi di scan berikutnya
 *
 * File .compressed adalah sidecar kecil (berisi timestamp ISO).
 * Akan ikut terhapus saat folder tanggal dihapus oleh enforceRetention().
 */

const fs   = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { compressSegment } = require('../utils/ffmpegHelper');

// ── State ──────────────────────────────────────────────────────────────────

const MARKER_EXT = '.compressed';

let _queue   = [];      // [{ file: string, camId: string }]
let _running = false;   // sedang kompresi?
let _current = null;    // path file yang sedang diproses
let _active  = null;    // getter fn: () => string[]  (injected from app.js)
const _stats = { done: 0, failed: 0, skipped: 0 };

// ── Init ────────────────────────────────────────────────────────────────────

/**
 * Init service. Harus dipanggil sekali saat boot.
 * @param {function} activeSegmentGetter  () => string[]  — daftar path file aktif direkam
 */
function init(activeSegmentGetter) {
  _active = activeSegmentGetter;
  logger.info('[Compression] Service initialized. Mode: post-process (rekam dulu, kompresi belakangan).');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isMarked(filePath) {
  return fs.existsSync(filePath + MARKER_EXT);
}

function mark(filePath) {
  try {
    fs.writeFileSync(filePath + MARKER_EXT, new Date().toISOString(), 'utf-8');
  } catch (_) {}
}

function isActiveSegment(filePath) {
  if (!_active) return false;
  try {
    return _active().some(p => p && path.resolve(p) === path.resolve(filePath));
  } catch (_) { return false; }
}

// ── Scanner ─────────────────────────────────────────────────────────────────

/**
 * Scan semua direktori rekaman untuk file .ts yang perlu dikompresi.
 * Dipanggil oleh cron di app.js.
 */
function scan() {
  const cfg = config.get();

  // Jika kompresi dinonaktifkan, skip
  if (!cfg.recording?.compression?.enabled) return;

  const baseDir = cfg.recording.baseDir;
  if (!fs.existsSync(baseDir)) return;

  const newItems = [];

  for (const camId of Object.keys(cfg.cameras)) {
    const camDir = path.join(baseDir, camId);
    if (!fs.existsSync(camDir)) continue;

    let dates;
    try { dates = fs.readdirSync(camDir).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)); }
    catch (_) { continue; }

    for (const date of dates) {
      const dateDir = path.join(camDir, date);
      let files;
      try { files = fs.readdirSync(dateDir); }
      catch (_) { continue; }

      for (const f of files) {
        // Hanya proses .ts, skip temp file
        if (!f.endsWith('.ts'))            continue;
        if (f.endsWith('.compressing'))    continue;

        const full = path.join(dateDir, f);

        // Skip: sudah bermarker (sudah dikompresi)
        if (isMarked(full)) continue;

        // Skip: ini segment yang sedang direkam sekarang
        if (isActiveSegment(full)) continue;

        // Skip: sudah ada di antrian atau sedang diproses
        if (_current === full)             continue;
        if (_queue.some(q => q.file === full)) continue;

        // Skip: file terlalu baru (mungkin baru selesai ditulis)
        // Buffer 60 detik setelah last modified
        try {
          const stat = fs.statSync(full);
          if (Date.now() - stat.mtimeMs < 60_000) continue;
          if (stat.size < 4096) continue;   // file kosong / rusak
        } catch (_) { continue; }

        newItems.push({ camId, file: full });
      }
    }
  }

  if (newItems.length > 0) {
    _queue.push(...newItems);
    logger.info(`[Compression] Scan: ${newItems.length} file baru diantri. Total antrian: ${_queue.length}`);
    _processNext();
  }
}

// ── Processor ────────────────────────────────────────────────────────────────

function _processNext() {
  if (_running || _queue.length === 0) return;

  // Recheck: kompresi mungkin dimatikan sejak scan terakhir
  const cfg = config.get();
  if (!cfg.recording?.compression?.enabled) {
    logger.info('[Compression] Dinonaktifkan — antrian dikosongkan.');
    _queue = [];
    return;
  }

  const item = _queue.shift();

  // Validasi ulang sebelum proses
  if (!fs.existsSync(item.file))  { _processNext(); return; }
  if (isMarked(item.file))        { _processNext(); return; }
  if (isActiveSegment(item.file)) {
    // Segment masih aktif — re-queue untuk dicoba lagi nanti
    _queue.push(item);
    return;
  }

  _running = true;
  _current = item.file;

  const comp = cfg.recording.compression;
  const basename = path.basename(item.file);
  const sizeBefore = (() => { try { return fs.statSync(item.file).size; } catch (_) { return 0; } })();

  logger.info(`[Compression] Mulai [${item.camId}] ${basename} (${(sizeBefore / 1_048_576).toFixed(1)} MB)…`);

  compressSegment(item.file, comp)
    .then(() => {
      mark(item.file);
      _stats.done++;
      const sizeAfter = (() => { try { return fs.statSync(item.file).size; } catch (_) { return 0; } })();
      const pct = sizeBefore > 0 ? Math.round((sizeAfter / sizeBefore) * 100) : '?';
      logger.info(`[Compression] ✓ Selesai [${item.camId}] ${basename} → ${(sizeAfter / 1_048_576).toFixed(1)} MB (${pct}% dari asli)`);
    })
    .catch((err) => {
      _stats.failed++;
      logger.error(`[Compression] ✗ Gagal [${item.camId}] ${basename}: ${err.message}`);
    })
    .finally(() => {
      _running = false;
      _current = null;
      // Jeda 3 detik antar file agar tidak membebani I/O
      setTimeout(_processNext, 3000);
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Ambil status kompresi saat ini.
 * Digunakan oleh GET /api/config/compression-status
 */
function getStatus() {
  const cfg = config.get();
  return {
    enabled:  cfg.recording?.compression?.enabled === true,
    running:  _running,
    current:  _current ? path.basename(_current) : null,
    queued:   _queue.length,
    stats:    { ..._stats }
  };
}

/**
 * Paksa scan sekarang (untuk trigger manual dari API).
 */
function forceScan() {
  logger.info('[Compression] Force scan diminta.');
  scan();
}

module.exports = { init, scan, forceScan, getStatus };
