'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { getDb } = require('../database');
const { getRecordingFiles } = require('./storageService');
const { clipVideo, concatVideos, probeStartTs } = require('../utils/ffmpegHelper');
const { _logActivity } = require('./recordingService');

/**
 * Find the recording segment(s) that cover a time window, then clip and export.
 *
 * Time window:
 *   start = DB start_time (MIN scan of resi) - startBuffer seconds
 *   end   = start_time of NEXT resi on same camera/date
 *           OR DB end_time (MAX scan of last item) + endBuffer if no next resi
 *
 * Re-export always overwrites the existing file.
 *
 * @param {string} resi  - Tracking number
 * @returns {Promise<string>} - Path to exported file
 */
async function exportByResi(resi) {
  const db = getDb();
  const cfg = config.get();

  const scan = db.prepare(`SELECT * FROM scan_logs WHERE resi = ? LIMIT 1`).get(resi);
  if (!scan) throw new Error(`Resi ${resi} not found in database`);

  const { camera, user, scan_date: date, start_time: startStr, end_time: endStr } = scan;
  if (!date || !startStr) throw new Error(`Scan record for ${resi} missing date/time`);

  const startBuffer = cfg.export?.startBuffer ?? 5;   // seconds before first scan
  const endBuffer   = cfg.export?.endBuffer   ?? 300; // seconds after last scan (end-of-shift)

  const rawStartSec = timeStr2sec(startStr);
  // endStr null = single-item resi (no MAX range); treat same as startStr
  const rawEndSec   = timeStr2sec(endStr || startStr);

  // Video starts a few seconds BEFORE the first scan
  const startSec = Math.max(0, rawStartSec - startBuffer);

  logger.info(`[Export] ${resi}: user="${user}" cam=${camera} date=${date} start=${startStr} end=${endStr || 'NULL'}`);
  logger.info(`[Export] ${resi}: rawStart=${secToTimeStr(rawStartSec)} rawEnd=${secToTimeStr(rawEndSec)} startBuf=${startBuffer}s endBuf=${endBuffer}s`);

  // Find the next different resi scanned by the SAME USER on the same date.
  // Use LOWER() for case-insensitive match in case user name casing differs between imports.
  // Fallback to camera-based query if user is empty/null.
  const refTime = endStr || startStr;
  let nextScan = null;

  if (user) {
    nextScan = db.prepare(`
      SELECT start_time, resi FROM scan_logs
      WHERE LOWER(user) = LOWER(?) AND scan_date = ? AND start_time > ? AND resi != ?
      ORDER BY start_time ASC LIMIT 1
    `).get(user, date, refTime, resi);
    logger.info(`[Export] ${resi}: nextScan by user "${user}" after ${refTime} → ${nextScan ? `${nextScan.resi} @ ${nextScan.start_time}` : 'NOT FOUND'}`);
  }

  // Fallback: if user is empty or no match found, use camera-based next scan
  if (!nextScan && camera) {
    nextScan = db.prepare(`
      SELECT start_time, resi FROM scan_logs
      WHERE camera = ? AND scan_date = ? AND start_time > ? AND resi != ?
      ORDER BY start_time ASC LIMIT 1
    `).get(camera, date, refTime, resi);
    logger.info(`[Export] ${resi}: nextScan fallback by camera "${camera}" after ${refTime} → ${nextScan ? `${nextScan.resi} @ ${nextScan.start_time}` : 'NOT FOUND'}`);
  }

  let endSec;
  if (nextScan) {
    // End at next resi's scan time OR rawEnd + endBuffer, whichever is sooner.
    // Prevents huge clips when the next resi is hours away (break / end of shift).
    const nextStartSec = timeStr2sec(nextScan.start_time);
    endSec = Math.max(rawEndSec + 5, Math.min(nextStartSec, rawEndSec + endBuffer));
    logger.info(`[Export] ${resi}: nextStartSec=${secToTimeStr(nextStartSec)} → endSec capped at ${secToTimeStr(endSec)}`);
  } else {
    // No next resi — add configurable buffer after the last scan
    endSec = rawEndSec + endBuffer;
    logger.info(`[Export] ${resi}: no nextScan → endSec = rawEnd + ${endBuffer}s = ${secToTimeStr(endSec)}`);
  }

  const duration = endSec - startSec;
  if (duration <= 0) throw new Error(`Invalid time range: ${startStr} -> ${secToTimeStr(endSec)}`);

  logger.info(`[Export] ${resi}: WINDOW ${secToTimeStr(startSec)} → ${secToTimeStr(endSec)} = ${duration}s`);

  // Get all segments for that camera/date
  const segments = getRecordingFiles(camera, date);
  if (!segments.length) throw new Error(`No recordings found for ${camera} on ${date}`);

  const segSeconds = cfg.recording.segmentMinutes * 60;

  // Find which segment(s) cover the window
  const relevant = segments.filter((seg) => {
    const segEnd = seg.startSeconds + segSeconds;
    return segEnd > startSec && seg.startSeconds < endSec;
  });

  if (!relevant.length) {
    throw new Error(`No segment covers ${secToTimeStr(startSec)}–${secToTimeStr(endSec)} for ${camera}`);
  }

  // Export dir
  const exportDir = cfg.export.dir;
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
  const outputFile = path.join(exportDir, `${resi}.mp4`);

  // Always delete old file first — avoids Windows file-lock issue with FFmpeg -y
  if (fs.existsSync(outputFile)) {
    try { fs.unlinkSync(outputFile); } catch (_) {}
  }

  // Probe first segment to detect timestamp style:
  //   firstPts ≈ 0        → 0-based (reset_timestamps worked) — seek is relative to segment start
  //   firstPts ≈ startSec → wall-clock (absolute seconds from midnight) — seek is absolute
  // If wall-clock, add seg.startSeconds to clipStart so FFmpeg seeks to the right position.
  const firstPts = await probeStartTs(relevant[0].path);
  const wallClock = firstPts > 100; // >100s → almost certainly wall-clock
  logger.info(`[Export] ${resi}: seg[0]="${relevant[0].file}" firstPts=${firstPts}s → ${wallClock ? 'WALL-CLOCK (seek=absolute)' : '0-BASED (seek=relative)'}`);

  /**
   * Compute FFmpeg seek position for a segment.
   * clipStart is always relative to the segment start (0-based math),
   * but if timestamps are wall-clock we must add the segment's wall-clock offset.
   */
  const ffSeek = (seg, clipStart) => wallClock ? clipStart + seg.startSeconds : clipStart;

  if (relevant.length === 1) {
    // Single segment: clip directly
    const seg = relevant[0];
    const clipStart = Math.max(startSec - seg.startSeconds, 0);
    const clipEnd   = Math.min(endSec - seg.startSeconds, segSeconds);
    const clipDur   = clipEnd - clipStart;
    if (clipDur <= 0) throw new Error('Clip duration is zero for single segment');
    logger.info(`[Export] ${resi}: clipStart=${clipStart}s ffSeek=${ffSeek(seg, clipStart)}s dur=${clipDur}s`);
    await clipVideo(seg.path, outputFile, ffSeek(seg, clipStart), clipDur);
  } else {
    // Multiple segments: clip each then concat
    const tmpDir = path.join(exportDir, '_tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const tmpFiles = [];
    for (let i = 0; i < relevant.length; i++) {
      const seg = relevant[i];
      const clipStart = i === 0 ? Math.max(startSec - seg.startSeconds, 0) : 0;
      const clipEnd   = i === relevant.length - 1 ? Math.min(endSec - seg.startSeconds, segSeconds) : segSeconds;
      const clipDur   = clipEnd - clipStart;

      if (clipDur <= 0) continue;
      const tmp = path.join(tmpDir, `${resi}_part${i}.ts`);
      logger.info(`[Export] ${resi} part${i} "${seg.file}": ffSeek=${ffSeek(seg, clipStart)}s dur=${clipDur}s`);
      await clipVideo(seg.path, tmp, ffSeek(seg, clipStart), clipDur);
      // Guard: skip if FFmpeg produced an empty/invalid file (segment had no data at offset)
      if (!fs.existsSync(tmp) || fs.statSync(tmp).size < 512) {
        try { fs.unlinkSync(tmp); } catch (_) {}
        logger.warn(`[Export] ${resi} part${i} empty/missing — skipping`);
        continue;
      }
      tmpFiles.push(tmp);
    }

    if (!tmpFiles.length) throw new Error('No clip parts generated');

    if (tmpFiles.length === 1) {
      fs.renameSync(tmpFiles[0], outputFile);
    } else {
      const listFile = path.join(tmpDir, `${resi}_list.txt`);
      await concatVideos(tmpFiles, outputFile, listFile);
      tmpFiles.forEach((f) => { try { fs.unlinkSync(f); } catch (_) {} });
    }
  }

  // Update DB
  const fileSize = fs.existsSync(outputFile) ? fs.statSync(outputFile).size : 0;
  db.prepare(`UPDATE scan_logs SET exported = 1, export_path = ?, status = 'exported' WHERE resi = ?`)
    .run(outputFile, resi);

  logger.info(`[Export] Exported ${resi} -> ${outputFile} (${formatBytes(fileSize)})`);
  _logActivity('info', 'EXPORT', `Exported resi ${resi}`, outputFile);

  return outputFile;
}

/**
 * Search for a resi and return its scan info + whether video is available.
 */
function searchResi(resi) {
  const db = getDb();
  const scan = db.prepare(`SELECT * FROM scan_logs WHERE resi = ?`).get(resi);
  if (!scan) return null;

  const cfg = config.get();
  const { camera, scan_date: date, start_time: startStr, end_time: endStr } = scan;

  const startBuffer = cfg.export?.startBuffer ?? 5;
  const endBuffer   = cfg.export?.endBuffer   ?? 300;

  const rawStartSec = timeStr2sec(startStr);
  const rawEndSec   = timeStr2sec(endStr || startStr);

  // Generous window for video availability check
  const startSec   = Math.max(0, rawStartSec - startBuffer);
  const endSec     = rawEndSec + endBuffer;
  const segSeconds = cfg.recording.segmentMinutes * 60;

  const segments = getRecordingFiles(camera, date);
  const hasVideo = segments.some((seg) => {
    const segEnd = seg.startSeconds + segSeconds;
    return segEnd > startSec && seg.startSeconds < endSec;
  });

  return { ...scan, hasVideo, endTime: endStr || secToTimeStr(rawEndSec + endBuffer) };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeStr2sec(str) {
  if (!str) return 0;
  const [h, m, s] = str.split(':').map(Number);
  return h * 3600 + m * 60 + (s || 0);
}

function secToTimeStr(sec) {
  const total = Math.floor(Math.max(0, sec));
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

module.exports = { exportByResi, searchResi };
