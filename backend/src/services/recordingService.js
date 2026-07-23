'use strict';

const fs   = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const ffmpeg = require('../utils/ffmpegHelper');
const { getDb } = require('../database');

// Map of camId -> { proc, status, reconnectCount, dir, startTime, stopped,
//                   _reconnectTimer, consecutiveFastFails }
const _state = new Map();

function _logActivity(level, category, message, detail) {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO activity_log (level, category, message, detail) VALUES (?, ?, ?, ?)`
    ).run(level, category, message, detail || null);
  } catch (_) {}
}

function _upsertCameraStatus(camId, fields) {
  const db = getDb();
  const existing = db.prepare(`SELECT id FROM camera_status WHERE camera_id = ?`).get(camId);
  if (existing) {
    const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE camera_status SET ${sets}, updated_at = datetime('now','localtime') WHERE camera_id = ?`)
      .run(...Object.values(fields), camId);
  } else {
    const cols = ['camera_id', ...Object.keys(fields)].join(', ');
    const vals = ['?', ...Object.keys(fields).map(() => '?')].join(', ');
    db.prepare(`INSERT INTO camera_status (${cols}) VALUES (${vals})`).run(camId, ...Object.values(fields));
  }
}

function _ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Reconnect delay dengan exponential backoff ──────────────────────────────
/**
 * Hitung delay reconnect berdasarkan consecutive fast-fail counter.
 *
 * "Fast fail" = FFmpeg mati dalam < 30 detik setelah spawn.
 * Ini menandakan kamera tidak bisa dijangkau (network down, port refused, dll).
 *
 * Backoff (base default 15 s):
 *   0–2 fast-fail : 15 s
 *   3             : 30 s
 *   4             : 60 s
 *   5             : 120 s
 *   6+            : 300 s (max default 5 menit)
 *
 * Ditambah jitter ±3 s agar kamera tidak reconnect bersamaan ke server RTSP.
 */
function _getReconnectDelay(camId) {
  const cfg   = config.get();
  const base  = cfg.ffmpeg.reconnectDelay    || 15_000;
  const max   = cfg.ffmpeg.maxReconnectDelay || 300_000;
  const st    = _state.get(camId) || {};
  const fails = st.consecutiveFastFails || 0;

  let delay = base;
  if (fails >= 3) {
    delay = Math.min(base * Math.pow(2, fails - 2), max);
  }

  // Jitter acak ±3 detik (mencegah thundering herd)
  const jitter = Math.floor(Math.random() * 6000) - 3000;
  return Math.max(base, delay + jitter);
}

// ── Start camera ────────────────────────────────────────────────────────────

function startCamera(camId) {
  const cfg = config.get();
  const cam = cfg.cameras[camId];
  if (!cam || !cam.enabled) return;

  // If already running, skip
  const existing = _state.get(camId);
  if (existing && existing.proc && !existing.proc.killed) {
    logger.info(`[${camId}] Already recording, skip start.`);
    return;
  }

  const rtspUrl = config.getRtspUrl(camId);
  // Use LOCAL date (not UTC) so the folder matches FFmpeg's strftime output (WIB = UTC+7)
  const now   = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const { dir, pattern } = ffmpeg.getSegmentPattern(camId, today);
  _ensureDir(dir);

  const proc = ffmpeg.startRecording(camId, rtspUrl, dir, pattern);
  const startTime = new Date();

  // Catat waktu spawn untuk deteksi fast-fail
  proc._spawnedAt = Date.now();

  // Preserve counters dari state sebelumnya
  const prevSt = _state.get(camId) || {};
  _state.set(camId, {
    proc,
    status:               'ONLINE',
    reconnectCount:       prevSt.reconnectCount       || 0,
    consecutiveFastFails: prevSt.consecutiveFastFails || 0,
    dir,
    startTime,
    stopped:         false,
    _reconnectTimer: null
  });

  _upsertCameraStatus(camId, {
    status:          'ONLINE',
    last_seen:       new Date().toISOString().replace('T', ' ').slice(0, 19),
    recording_pid:   proc.pid,
    current_segment: pattern
  });

  _logActivity('info', 'RECORDING', `[${camId}] Recording started`, rtspUrl);
  logger.info(`[${camId}] Recording started. PID=${proc.pid}`);

  proc.on('close', (code) => {
    const elapsed  = Date.now() - (proc._spawnedAt || Date.now());
    const fastFail = elapsed < 30_000;   // mati < 30 detik = fast fail

    logger.warn(`[${camId}] FFmpeg exited code=${code} (${(elapsed/1000).toFixed(1)}s)`);
    _logActivity('warn', 'RECORDING', `[${camId}] FFmpeg exited code=${code}`);

    // Update fast-fail counter
    const st = _state.get(camId) || {};
    if (fastFail) {
      st.consecutiveFastFails = (st.consecutiveFastFails || 0) + 1;
      if (st.consecutiveFastFails > 2) {
        logger.warn(`[${camId}] Fast-fail #${st.consecutiveFastFails} — backoff aktif`);
      }
    } else {
      // Berhasil stream > 30 s — reset backoff counter
      if (st.consecutiveFastFails > 0) {
        logger.info(`[${camId}] Stream stabil — reset backoff counter`);
      }
      st.consecutiveFastFails = 0;
    }
    _state.set(camId, st);

    _handleDisconnect(camId);
  });

  proc.on('error', (err) => {
    logger.error(`[${camId}] FFmpeg spawn error: ${err.message}`);
    _logActivity('error', 'RECORDING', `[${camId}] FFmpeg spawn error`, err.message);
    _handleDisconnect(camId);
  });
}

// ── Disconnect handler ──────────────────────────────────────────────────────

function _handleDisconnect(camId) {
  const st = _state.get(camId) || {};
  st.status = 'OFFLINE';
  st.proc   = null;
  _state.set(camId, st);

  _upsertCameraStatus(camId, { status: 'OFFLINE', recording_pid: null });
  _logActivity('warn', 'CAMERA', `[${camId}] Camera OFFLINE`);

  // Jika sengaja distop, jangan reconnect
  if (st.stopped) return;

  const delay = _getReconnectDelay(camId);
  logger.warn(`[${camId}] Camera OFFLINE. Reconnect dalam ${(delay/1000).toFixed(0)}s...`);
  _scheduleReconnect(camId, delay);
}

function _scheduleReconnect(camId, delay) {
  // Cegah timer stack: hapus timer lama
  const st = _state.get(camId);
  if (st && st._reconnectTimer) {
    clearTimeout(st._reconnectTimer);
    st._reconnectTimer = null;
  }

  const timer = setTimeout(() => {
    const st = _state.get(camId);
    if (!st || st.stopped)           return;
    if (st.proc && !st.proc.killed)  return;   // sudah online

    const reconnectCount = (st.reconnectCount || 0) + 1;
    st.reconnectCount  = reconnectCount;
    st._reconnectTimer = null;
    _state.set(camId, st);

    const fails = st.consecutiveFastFails || 0;
    const suffix = fails > 2 ? ` [backoff x${fails}]` : '';
    logger.info(`[${camId}] Reconnect #${reconnectCount}${suffix}`);
    _logActivity('info', 'CAMERA', `[${camId}] Reconnect attempt #${reconnectCount}`);
    _upsertCameraStatus(camId, { reconnect_count: reconnectCount });

    startCamera(camId);
  }, delay);

  if (st) {
    st._reconnectTimer = timer;
    _state.set(camId, st);
  }
}

// ── Stop ────────────────────────────────────────────────────────────────────

function stopCamera(camId) {
  const st = _state.get(camId);
  if (!st) return;
  st.stopped = true;

  // Bersihkan reconnect timer
  if (st._reconnectTimer) {
    clearTimeout(st._reconnectTimer);
    st._reconnectTimer = null;
  }

  if (st.proc && !st.proc.killed) {
    logger.info(`[${camId}] Recording stopped by user.`);
    _logActivity('info', 'RECORDING', `[${camId}] Recording stopped`);
    try { st.proc.kill(); } catch (_) {}
  }

  _upsertCameraStatus(camId, { status: 'OFFLINE', recording_pid: null });
}

function startAll() {
  const cfg = config.get();
  Object.keys(cfg.cameras).forEach((camId) => {
    const cam = cfg.cameras[camId];
    if (cam.enabled) {
      // Full reset pada manual startAll
      const st = _state.get(camId) || {};
      st.stopped              = false;
      st.reconnectCount       = 0;
      st.consecutiveFastFails = 0;
      _state.set(camId, st);
      startCamera(camId);
    }
  });
}

function stopAll() {
  const cfg = config.get();
  Object.keys(cfg.cameras).forEach((camId) => stopCamera(camId));
}

// ── Status ───────────────────────────────────────────────────────────────────

function getStatus() {
  const db = getDb();
  return db.prepare(`SELECT * FROM camera_status`).all();
}

function getCameraState(camId) {
  return _state.get(camId) || null;
}

/**
 * Kembalikan list path .ts yang sedang aktif direkam saat ini.
 * Digunakan oleh compressionService untuk menghindari kompresi file aktif.
 *
 * Heuristik: file .ts paling baru dimodifikasi di direktori aktif tiap kamera.
 */
function getActiveSegmentPaths() {
  const paths = [];

  _state.forEach((st) => {
    if (!st.proc || st.proc.killed || !st.dir) return;
    if (!fs.existsSync(st.dir)) return;

    try {
      const tsFiles = fs.readdirSync(st.dir)
        .filter(f => f.endsWith('.ts') && !f.endsWith('.compressing'))
        .map(f => path.join(st.dir, f));

      if (tsFiles.length === 0) return;

      // File paling baru dimodifikasi = segment aktif
      const latest = tsFiles.reduce((a, b) => {
        try {
          const at = fs.statSync(a).mtimeMs;
          const bt = fs.statSync(b).mtimeMs;
          return at > bt ? a : b;
        } catch (_) { return a; }
      });

      paths.push(latest);
    } catch (_) {}
  });

  return paths;
}

// ── Day rollover ─────────────────────────────────────────────────────────────

/**
 * Called by scheduler to handle day rollover:
 * Restart recording so new directory is created for the new date.
 */
function checkDayRollover() {
  const cfg = config.get();
  const _now = new Date();
  const today = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}`;

  Object.keys(cfg.cameras).forEach((camId) => {
    const st = _state.get(camId);
    if (!st) return;
    const stDate = st.startTime ? st.startTime.toISOString().slice(0, 10) : null;
    if (stDate && stDate !== today) {
      logger.info(`[${camId}] Day rollover detected. Restarting recording.`);
      stopCamera(camId);
      setTimeout(() => {
        const s = _state.get(camId);
        if (s) {
          s.stopped               = false;
          s.consecutiveFastFails  = 0;   // reset backoff untuk hari baru
        }
        startCamera(camId);
      }, 2000);
    }
  });
}

module.exports = {
  startCamera,
  stopCamera,
  startAll,
  stopAll,
  getStatus,
  getCameraState,
  getActiveSegmentPaths,
  checkDayRollover,
  _logActivity
};
