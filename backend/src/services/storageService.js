'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const { getDb } = require('../database');
const { _logActivity } = require('./recordingService');

/**
 * Delete recording directories older than retentionDays.
 * Structure: baseDir/CAM01/YYYY-MM-DD/...
 */
function enforceRetention() {
  const cfg = config.get();
  const baseDir = cfg.recording.baseDir;
  const retentionDays = cfg.recording.retentionDays;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  if (!fs.existsSync(baseDir)) return;

  let deletedCount = 0;

  const cameras = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const cam of cameras) {
    const camDir = path.join(baseDir, cam);
    const dates = fs.readdirSync(camDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const date of dates) {
      if (date < cutoffStr) {
        const dateDir = path.join(camDir, date);
        try {
          fs.rmSync(dateDir, { recursive: true, force: true });
          deletedCount++;
          logger.info(`[Storage] Deleted expired dir: ${dateDir}`);
          _logActivity('info', 'STORAGE', `Deleted expired recording: ${dateDir}`);

          // Remove from DB
          const db = getDb();
          db.prepare(`DELETE FROM recordings WHERE camera_id = ? AND record_date = ?`).run(cam, date);
          db.prepare(`DELETE FROM scan_logs WHERE camera = ? AND scan_date = ?`).run(cam, date);
        } catch (err) {
          logger.error(`[Storage] Failed to delete ${dateDir}: ${err.message}`);
        }
      }
    }
  }

  logger.info(`[Storage] Retention check complete. Deleted ${deletedCount} date folder(s).`);
  return deletedCount;
}

/**
 * Get storage statistics for the recording base dir.
 */
async function getStorageStats() {
  const cfg = config.get();
  const baseDir = cfg.recording.baseDir;

  let used = 0;
  let fileCount = 0;

  if (fs.existsSync(baseDir)) {
    const result = getDirSize(baseDir);
    used = result.size;
    fileCount = result.count;
  }

  // Try to get disk free space (Windows: use wmic)
  let total = 0;
  let free = 0;
  try {
    const drive = baseDir.slice(0, 2); // e.g. "D:"
    const { execSync } = require('child_process');
    const out = execSync(`wmic logicaldisk where "DeviceID='${drive}'" get Size,FreeSpace /value`, {
      timeout: 5000,
      windowsHide: true
    }).toString();
    const freeMatch = out.match(/FreeSpace=(\d+)/);
    const sizeMatch = out.match(/Size=(\d+)/);
    if (freeMatch) free = parseInt(freeMatch[1]);
    if (sizeMatch) total = parseInt(sizeMatch[1]);
  } catch (_) {}

  return { used, free, total, fileCount };
}

function getDirSize(dirPath) {
  let size = 0;
  let count = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const sub = getDirSize(full);
        size += sub.size;
        count += sub.count;
      } else {
        try {
          size += fs.statSync(full).size;
          count++;
        } catch (_) {}
      }
    }
  } catch (_) {}
  return { size, count };
}

/**
 * Sync recordings directory into the recordings table.
 * Called on startup and periodically.
 */
function syncRecordingsToDb() {
  const cfg = config.get();
  const baseDir = cfg.recording.baseDir;
  if (!fs.existsSync(baseDir)) return;

  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO recordings (camera_id, file_path, file_name, record_date, start_ts, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const cameras = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.match(/^CAM\d+$/i))
    .map((d) => d.name);

  for (const cam of cameras) {
    const camDir = path.join(baseDir, cam);
    const dates = fs.readdirSync(camDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const date of dates) {
      const dateDir = path.join(camDir, date);
      const files = fs.readdirSync(dateDir).filter((f) => f.endsWith('.ts') || f.endsWith('.mp4'));
      for (const file of files) {
        const filePath = path.join(dateDir, file);
        const baseName = file.replace(/\.(ts|mp4)$/, '');
        const startTs = `${date} ${baseName.replace(/(\d{2})(\d{2})/, '$1:$2:00')}`;
        let size = 0;
        try { size = fs.statSync(filePath).size; } catch (_) {}
        insert.run(cam, filePath, file, date, startTs, size);
      }
    }
  }
}

/**
 * Get recording files for a camera on a given date, sorted by name.
 */
function getRecordingFiles(camId, date) {
  const cfg = config.get();
  const dateDir = path.join(cfg.recording.baseDir, camId, date);
  if (!fs.existsSync(dateDir)) return [];

  return fs.readdirSync(dateDir)
    .filter((f) => f.endsWith('.ts') || f.endsWith('.mp4'))
    .sort()
    .map((f) => {
      const base = f.replace(/\.(ts|mp4)$/, '');
      return {
        file: f,
        path: path.join(dateDir, f),
        startHHMM: base,
        startSeconds: hhmm2sec(base)
      };
    });
}

/** "HHmm" -> seconds from midnight */
function hhmm2sec(hhmm) {
  const h = parseInt(hhmm.slice(0, 2));
  const m = parseInt(hhmm.slice(2, 4));
  return h * 3600 + m * 60;
}

module.exports = { enforceRetention, getStorageStats, syncRecordingsToDb, getRecordingFiles, hhmm2sec };
