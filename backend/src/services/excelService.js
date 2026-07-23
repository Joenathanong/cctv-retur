'use strict';

const XLSX = require('xlsx');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { getDb } = require('../database');
const { _logActivity } = require('./recordingService');

/**
 * Parse an Excel file (Jubelio Retur format) and insert scan logs.
 *
 * Excel format:
 *   - "No. Pesanan/Resi"  → resi number
 *   - "Created By"        → operator name
 *   - "Created Date"      → datetime "YYYY-MM-DD HH:mm:ss"
 *
 * Logic:
 *   - One resi may have multiple rows (multi-item per package).
 *     We take only the FIRST scan time per resi+user as the record.
 *   - End time = start time of the next distinct resi by the same user.
 *   - Rows where (resi, scan_date) already exist in DB are skipped.
 *
 * Returns { inserted, skipped, errors }
 */
function importExcel(filePath) {
  const cfg = config.get();
  const colCfg = cfg.excel.columns;

  // 1) Baca workbook tanpa konversi Date (raw serial number tetap sebagai number).
  // 2) Normalisasi semua cell datetime → format 'dd/mm/yyyy hh:mm:ss' agar
  //    raw:false mengeluarkan detik yang benar (tidak hanya sampai menit).
  // 3) raw:false → XLSX memformat tiap cell sebagai string sesuai format cell-nya,
  //    menghindari floating-point precision loss dari Date object.
  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  normalizeDateCellFormats(sheet);
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

  if (!rows.length) return { inserted: 0, skipped: 0, errors: ['No data found in Excel file'] };

  // Match column names (case-insensitive, trim)
  const resiKey = findKey(rows[0], colCfg.resi);
  const userKey = findKey(rows[0], colCfg.user);
  const timeKey = findKey(rows[0], colCfg.scanTime);

  if (!resiKey || !userKey || !timeKey) {
    const keys = Object.keys(rows[0]).join(', ');
    return {
      inserted: 0,
      skipped: 0,
      errors: [
        `Column mapping failed. Found: [${keys}]. Expected: "${colCfg.resi}", "${colCfg.user}", "${colCfg.scanTime}"`
      ]
    };
  }

  const userMapping = cfg.userCameraMapping;

  // ── Step 1: Parse all rows ────────────────────────────────────────────
  const parsed = [];
  for (const row of rows) {
    const resi    = String(row[resiKey] || '').trim();
    const user    = String(row[userKey] || '').trim();
    const scanRaw = row[timeKey];

    if (!resi || !user) continue;

    const { date, timeStr } = parseScanTime(scanRaw);
    if (!date || !timeStr) continue;

    const camera = resolveCamera(user, userMapping);
    parsed.push({ resi, user, camera, date, timeStr });
  }

  // ── Step 2: Group by (resi, user, date) — compute MIN start & MAX end ──
  // One resi can have many items; each item adds a scan row.
  // start_time = earliest scan of that resi  (first item scanned)
  // end_time   = latest scan of that resi    (last item scanned)
  // For single-item resi: end_time = start_time + defaultDuration
  //
  // Map key preserves insertion order → chronological order in Excel.
  const groups = new Map(); // key: `${user}|${resi}|${date}`

  for (const entry of parsed) {
    const key = `${entry.user}|${entry.resi}|${entry.date}`;
    if (!groups.has(key)) {
      groups.set(key, {
        resi:      entry.resi,
        user:      entry.user,
        camera:    entry.camera,
        date:      entry.date,
        startTime: entry.timeStr,
        endTime:   entry.timeStr   // extended below as later scans are seen
      });
    } else {
      const g = groups.get(key);
      if (entry.timeStr < g.startTime) g.startTime = entry.timeStr;
      if (entry.timeStr > g.endTime)   g.endTime   = entry.timeStr;
    }
  }

  // Flatten to array.
  // For single-scan resi: store NULL end_time — exportService adds the configurable end buffer.
  // For multi-item resi: store raw MAX scan time (no baked-in buffer).
  const deduped = [];
  for (const g of groups.values()) {
    const endTime = g.startTime === g.endTime ? null : g.endTime;
    deduped.push({ resi: g.resi, user: g.user, camera: g.camera, date: g.date, timeStr: g.startTime, endTime });
  }

  // ── Step 3: Upsert into DB ────────────────────────────────────────────
  // • New resi       → INSERT
  // • Existing resi with DIFFERENT times → UPDATE (fixes records from old import logic)
  // • Existing resi with same times      → skip (no change)
  const db = getDb();
  const checkExists = db.prepare(
    `SELECT id, start_time, end_time FROM scan_logs WHERE resi = ? AND scan_date = ? LIMIT 1`
  );
  const insert = db.prepare(`
    INSERT INTO scan_logs (resi, user, camera, scan_date, start_time, end_time, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);
  const update = db.prepare(`
    UPDATE scan_logs SET start_time = ?, end_time = ?, user = ?, camera = ?, status = 'pending', exported = 0, export_path = NULL
    WHERE id = ?
  `);

  let inserted = 0;
  let updated  = 0;
  let skipped  = 0;
  const errors  = [];

  const insertMany = db.transaction(() => {
    for (const row of deduped) {
      try {
        const existing = checkExists.get(row.resi, row.date);
        if (existing) {
          if (existing.start_time !== row.timeStr || existing.end_time !== (row.endTime || null)) {
            // Times differ — update with corrected range
            update.run(row.timeStr, row.endTime || null, row.user, row.camera, existing.id);
            updated++;
          } else {
            skipped++;
          }
        } else {
          insert.run(row.resi, row.user, row.camera, row.date, row.timeStr, row.endTime || null);
          inserted++;
        }
      } catch (err) {
        errors.push(`Resi ${row.resi}: ${err.message}`);
      }
    }
  });

  insertMany();

  logger.info(`[Excel] Import done: ${inserted} inserted, ${updated} updated, ${skipped} skipped, ${errors.length} errors`);
  _logActivity('info', 'EXCEL', `Excel imported: ${inserted} inserted, ${updated} updated, ${skipped} skipped`, path.basename(filePath));

  return { inserted, updated, skipped, errors };
}

/**
 * Normalize all datetime-formatted cells in a sheet to 'dd/mm/yyyy hh:mm:ss'.
 * This ensures sheet_to_json({ raw: false }) outputs full datetime with seconds,
 * regardless of the original format (e.g. 'DD MMM YYYY HH:MM' → now includes seconds).
 * The underlying Excel serial number already stores sub-minute precision;
 * only the FORMAT string needs to be updated.
 */
function normalizeDateCellFormats(sheet) {
  if (!sheet['!ref']) return;
  const range = XLSX.utils.decode_range(sheet['!ref']);
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = sheet[addr];
      // Only numeric cells with a date+time format string need normalization
      if (!cell || cell.t !== 'n' || !cell.z) continue;
      const fmt = cell.z;
      // Detect date+time: format must contain date tokens (d/m/y) AND time token (h)
      const hasDate = /[dDmMyY]/.test(fmt);
      const hasTime = /[hH]/.test(fmt);
      if (hasDate && hasTime) {
        cell.z = 'dd/mm/yyyy hh:mm:ss';
        delete cell.w; // hapus cache teks lama agar raw:false format ulang dengan cell.z baru
      }
    }
  }
}

/**
 * Find the actual key in a row object that matches the target column reference.
 * Supports two modes:
 *   1. Column letter  — "B", "J", "K", "AA"  (case-insensitive)
 *   2. Column name    — "No. Pesanan/Resi"    (case-insensitive, existing behaviour)
 */
function findKey(row, target) {
  const keys = Object.keys(row);
  const t    = String(target ?? '').trim();
  if (!t) return undefined;

  // Column letter reference: 1–3 alpha chars only
  if (/^[A-Za-z]{1,3}$/.test(t)) {
    const idx = colLetterToIdx(t.toUpperCase());
    if (idx >= 0 && idx < keys.length) return keys[idx];
  }

  // Column name match (case-insensitive, trimmed)
  const lower = t.toLowerCase();
  return keys.find((k) => k.toLowerCase().trim() === lower);
}

/** "A" → 0, "B" → 1, "J" → 9, "K" → 10, "AA" → 26, … */
function colLetterToIdx(col) {
  let n = 0;
  for (const c of col) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}

/**
 * Resolve operator name → camera ID.
 * Tries exact match first, then partial/case-insensitive match.
 * Falls back to 'UNKNOWN' if no match found.
 */
function resolveCamera(user, mapping) {
  if (!user || !mapping) return 'UNKNOWN';
  // Exact match
  if (mapping[user]) return mapping[user];
  // Case-insensitive match
  const lower = user.toLowerCase();
  for (const [k, v] of Object.entries(mapping)) {
    if (k.toLowerCase() === lower) return v;
  }
  // Partial match (mapping key contained in user name or vice-versa)
  for (const [k, v] of Object.entries(mapping)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }
  return 'UNKNOWN';
}

/**
 * Parse scan time from various formats:
 *   - Date object (from cellDates:true)
 *   - "YYYY-MM-DD HH:mm:ss" string
 *   - Excel serial number
 *   - "HH:mm:ss" only string (uses today as date)
 */
function parseScanTime(raw) {
  if (!raw) return { date: '', timeStr: '' };

  // Date object (most common with cellDates:true)
  // Use LOCAL time methods — toISOString() shifts to UTC and can give wrong date for WIB (+07).
  if (raw instanceof Date) {
    const date    = `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
    const timeStr = `${pad(raw.getHours())}:${pad(raw.getMinutes())}:${pad(raw.getSeconds())}`;
    return { date, timeStr };
  }

  // Excel serial number
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    return {
      date:    `${d.y}-${pad(d.m)}-${pad(d.d)}`,
      timeStr: `${pad(d.H)}:${pad(d.M)}:${pad(d.S)}`
    };
  }

  // String formats
  const str = String(raw).trim();

  // "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss"
  const dtMatch = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (dtMatch) return { date: dtMatch[1], timeStr: dtMatch[2] };

  // "dd/mm/yyyy HH:mm:ss" or "dd/mm/yyyy HH:mm" (with or without seconds)
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{2}:\d{2})(?::(\d{2}))?/);
  if (dmyMatch) {
    const date    = `${dmyMatch[3]}-${pad(+dmyMatch[2])}-${pad(+dmyMatch[1])}`;
    const timeStr = `${dmyMatch[4]}:${dmyMatch[5] ? pad(+dmyMatch[5]) : '00'}`;
    return { date, timeStr };
  }

  // "dd Mmm yyyy HH:mm:ss" or "dd Mmm yyyy HH:mm" (e.g. "22 Jul 2026 13:38:27")
  const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const dmmyMatch = str.match(/^(\d{1,2})\s+([a-zA-Z]{3})\s+(\d{4})\s+(\d{2}:\d{2})(?::(\d{2}))?/);
  if (dmmyMatch) {
    const m = MONTHS[dmmyMatch[2].toLowerCase()];
    if (m) {
      const date    = `${dmmyMatch[3]}-${pad(m)}-${pad(+dmmyMatch[1])}`;
      const timeStr = `${dmmyMatch[4]}:${dmmyMatch[5] ? pad(+dmmyMatch[5]) : '00'}`;
      return { date, timeStr };
    }
  }

  // "HH:mm:ss" only
  const tMatch = str.match(/^(\d{2}:\d{2}:\d{2})/);
  if (tMatch) {
    const today = new Date().toISOString().slice(0, 10);
    return { date: today, timeStr: tMatch[1] };
  }

  return { date: '', timeStr: '' };
}

function addSeconds(timeStr, secs) {
  if (!timeStr) return null;
  const [h, m, s] = timeStr.split(':').map(Number);
  const total = h * 3600 + m * 60 + s + secs;
  const nh = Math.floor(total / 3600) % 24;
  const nm = Math.floor((total % 3600) / 60);
  const ns = total % 60;
  return `${pad(nh)}:${pad(nm)}:${pad(ns)}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

module.exports = { importExcel, parseScanTime };
