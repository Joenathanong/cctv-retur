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
 * Columns configured in config.excel.columns — accepts column letter OR header name:
 *   resi     → "B"  (or "No. Pesanan/Resi")
 *   user     → "J"  (or "Created By")
 *   scanTime → "K"  (or "Created Date")
 *
 * Strategy: read with raw:true so numeric date cells come as plain JS numbers
 * (e.g. 46225.92057), then XLSX.SSF.parse_date_code() converts them accurately
 * using Math.round(86400 * frac) — avoids all floating-point drift issues.
 *
 * 46225.92057 → frac=0.92057 → Math.round(79537.248)=79537s = 22:05:37 ✓
 *
 * Returns { inserted, updated, skipped, errors }
 */
function importExcel(filePath) {
  const cfg    = config.get();
  const colCfg = cfg.excel.columns;

  // Read workbook: raw:true = no date formatting, no cell.w cache issues.
  // header:1 = each row is an array (not an object), allRows[0] = header row.
  const wb      = XLSX.readFile(filePath);
  const sheet   = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });

  if (allRows.length < 2) {
    return { inserted: 0, skipped: 0, errors: ['No data found in Excel file'] };
  }

  const headerRow = allRows[0];

  // Resolve column indices. "B" → 1, "J" → 9, "K" → 10.
  // Header name fallback: case-insensitive search in headerRow.
  const resiIdx = resolveColIndex(headerRow, colCfg.resi);
  const userIdx = resolveColIndex(headerRow, colCfg.user);
  const timeIdx = resolveColIndex(headerRow, colCfg.scanTime);

  logger.info(`[Excel] Column indices — resi(${colCfg.resi}):${resiIdx}  user(${colCfg.user}):${userIdx}  scanTime(${colCfg.scanTime}):${timeIdx}`);

  if (resiIdx < 0 || userIdx < 0 || timeIdx < 0) {
    const headers = headerRow.filter(Boolean).slice(0, 20).join(', ');
    return {
      inserted: 0,
      skipped:  0,
      errors: [
        `Column mapping failed. Headers: [${headers}]. ` +
        `Config: resi="${colCfg.resi}"(idx=${resiIdx}), user="${colCfg.user}"(idx=${userIdx}), scanTime="${colCfg.scanTime}"(idx=${timeIdx})`
      ]
    };
  }

  const userMapping = cfg.userCameraMapping;

  // ── Step 1: Parse all rows ────────────────────────────────────────────
  const parsed = [];
  for (let ri = 1; ri < allRows.length; ri++) {
    const row     = allRows[ri];
    const resi    = String(row[resiIdx] ?? '').trim();
    const user    = String(row[userIdx] ?? '').trim();
    const scanRaw = row[timeIdx];

    if (!resi || !user) continue;

    const { date, timeStr } = parseScanTime(scanRaw);
    if (!date || !timeStr) continue;

    const camera = resolveCamera(user, userMapping);
    parsed.push({ resi, user, camera, date, timeStr });
  }

  // ── Step 2: Group by (user, resi, date) — MIN start, MAX end ─────────
  // One resi may have multiple scanned items; each becomes a row in the Excel.
  // start_time = earliest scan time for that resi (first item)
  // end_time   = latest scan time (last item), or NULL if only one scan
  const groups = new Map();

  for (const entry of parsed) {
    const key = `${entry.user}|${entry.resi}|${entry.date}`;
    if (!groups.has(key)) {
      groups.set(key, { ...entry, startTime: entry.timeStr, endTime: entry.timeStr });
    } else {
      const g = groups.get(key);
      if (entry.timeStr < g.startTime) g.startTime = entry.timeStr;
      if (entry.timeStr > g.endTime)   g.endTime   = entry.timeStr;
    }
  }

  const deduped = [];
  for (const g of groups.values()) {
    const endTime = g.startTime === g.endTime ? null : g.endTime;
    deduped.push({ resi: g.resi, user: g.user, camera: g.camera, date: g.date, timeStr: g.startTime, endTime });
  }

  // ── Step 3: Upsert into DB ────────────────────────────────────────────
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

  let inserted = 0, updated = 0, skipped = 0;
  const errors = [];

  const insertMany = db.transaction(() => {
    for (const row of deduped) {
      try {
        const existing = checkExists.get(row.resi, row.date);
        if (existing) {
          if (existing.start_time !== row.timeStr || existing.end_time !== (row.endTime || null)) {
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

// ── Column resolution ─────────────────────────────────────────────────────────

/**
 * Resolve column index from a letter or header name.
 *   "B"          → 1   (0-based column index)
 *   "J"          → 9
 *   "K"          → 10
 *   "Created By" → searches headerRow case-insensitively
 * Returns -1 if not found.
 */
function resolveColIndex(headerRow, target) {
  const t = String(target ?? '').trim();
  if (!t) return -1;

  // Column letter reference (1–3 alpha chars, no spaces/dots)
  if (/^[A-Za-z]{1,3}$/.test(t)) {
    return colLetterToIdx(t.toUpperCase());
  }

  // Header name match (case-insensitive, trimmed)
  const lower = t.toLowerCase();
  return headerRow.findIndex((h) => String(h ?? '').toLowerCase().trim() === lower);
}

/** "A" → 0, "B" → 1, "J" → 9, "K" → 10, "AA" → 26 */
function colLetterToIdx(col) {
  let n = 0;
  for (const c of col) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}

// ── Camera resolution ─────────────────────────────────────────────────────────

function resolveCamera(user, mapping) {
  if (!user || !mapping) return 'UNKNOWN';
  if (mapping[user]) return mapping[user];
  const lower = user.toLowerCase();
  for (const [k, v] of Object.entries(mapping)) {
    if (k.toLowerCase() === lower) return v;
  }
  for (const [k, v] of Object.entries(mapping)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }
  return 'UNKNOWN';
}

// ── Date/time parsing ─────────────────────────────────────────────────────────

/**
 * Convert raw cell value → { date: "YYYY-MM-DD", timeStr: "HH:mm:ss" }.
 *
 * With raw:true, proper date cells arrive as Excel serial numbers:
 *   46225.92057 → integer=46225 (2026-07-22), frac=0.92057
 *   XLSX.SSF.parse_date_code: Math.round(86400 × 0.92057) = 79537s = 22:05:37 ✓
 *
 * String fallbacks handle text-format cells and legacy imports.
 */
function parseScanTime(raw) {
  if (raw == null || raw === '') return { date: '', timeStr: '' };

  // ── Number: Excel serial date (most common with raw:true) ──────────────
  if (typeof raw === 'number' && raw > 1) {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d && d.y > 1900) {
      return {
        date:    `${d.y}-${pad(d.m)}-${pad(d.d)}`,
        timeStr: `${pad(d.H)}:${pad(d.M)}:${pad(d.S)}`
      };
    }
  }

  // ── String: try various text date formats ──────────────────────────────
  const str = String(raw).trim();

  // Plain numeric string like "46225.92057"
  if (/^\d+(\.\d+)?$/.test(str)) {
    const n = parseFloat(str);
    if (n > 1) {
      const d = XLSX.SSF.parse_date_code(n);
      if (d && d.y > 1900) {
        return {
          date:    `${d.y}-${pad(d.m)}-${pad(d.d)}`,
          timeStr: `${pad(d.H)}:${pad(d.M)}:${pad(d.S)}`
        };
      }
    }
  }

  // "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss"
  const dtMatch = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (dtMatch) return { date: dtMatch[1], timeStr: dtMatch[2] };

  // "dd/mm/yyyy HH:mm:ss" or "dd/mm/yyyy HH:mm"
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{2}:\d{2})(?::(\d{2}))?/);
  if (dmyMatch) {
    return {
      date:    `${dmyMatch[3]}-${pad(+dmyMatch[2])}-${pad(+dmyMatch[1])}`,
      timeStr: `${dmyMatch[4]}:${dmyMatch[5] !== undefined ? pad(+dmyMatch[5]) : '00'}`
    };
  }

  // "dd Mmm yyyy HH:mm:ss" (e.g. "22 Jul 2026 13:38:27")
  const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  const dmmyMatch = str.match(/^(\d{1,2})\s+([a-zA-Z]{3})\s+(\d{4})\s+(\d{2}:\d{2})(?::(\d{2}))?/);
  if (dmmyMatch) {
    const m = MONTHS[dmmyMatch[2].toLowerCase()];
    if (m) {
      return {
        date:    `${dmmyMatch[3]}-${pad(m)}-${pad(+dmmyMatch[1])}`,
        timeStr: `${dmmyMatch[4]}:${dmmyMatch[5] !== undefined ? pad(+dmmyMatch[5]) : '00'}`
      };
    }
  }

  // "HH:mm:ss" only (fallback: use today's date)
  const tMatch = str.match(/^(\d{2}:\d{2}:\d{2})/);
  if (tMatch) {
    return { date: new Date().toISOString().slice(0, 10), timeStr: tMatch[1] };
  }

  return { date: '', timeStr: '' };
}

function pad(n) { return String(n).padStart(2, '0'); }

module.exports = { importExcel, parseScanTime };
