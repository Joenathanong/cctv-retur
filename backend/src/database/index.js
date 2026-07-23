'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');

let _db = null;

function getDb() {
  if (_db) return _db;

  const cfg = config.get();
  const dbPath = cfg.database.path;
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      resi        TEXT    NOT NULL,
      user        TEXT    NOT NULL,
      camera      TEXT    NOT NULL,
      scan_date   TEXT    NOT NULL,
      start_time  TEXT    NOT NULL,
      end_time    TEXT,
      video_file  TEXT,
      status      TEXT    NOT NULL DEFAULT 'pending',
      exported    INTEGER NOT NULL DEFAULT 0,
      export_path TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_scan_resi   ON scan_logs(resi);
    CREATE INDEX IF NOT EXISTS idx_scan_user   ON scan_logs(user);
    CREATE INDEX IF NOT EXISTS idx_scan_date   ON scan_logs(scan_date);
    CREATE INDEX IF NOT EXISTS idx_scan_status ON scan_logs(status);

    CREATE TABLE IF NOT EXISTS camera_status (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id       TEXT    NOT NULL UNIQUE,
      status          TEXT    NOT NULL DEFAULT 'OFFLINE',
      last_seen       TEXT,
      reconnect_count INTEGER NOT NULL DEFAULT 0,
      recording_pid   INTEGER,
      current_segment TEXT,
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS recordings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id   TEXT NOT NULL,
      file_path   TEXT NOT NULL UNIQUE,
      file_name   TEXT NOT NULL,
      record_date TEXT NOT NULL,
      start_ts    TEXT NOT NULL,
      end_ts      TEXT,
      size_bytes  INTEGER DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_rec_camera ON recordings(camera_id);
    CREATE INDEX IF NOT EXISTS idx_rec_date   ON recordings(record_date);

    CREATE TABLE IF NOT EXISTS activity_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      level      TEXT NOT NULL DEFAULT 'info',
      category   TEXT NOT NULL,
      message    TEXT NOT NULL,
      detail     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_log_created ON activity_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_log_level   ON activity_log(level);
  `);
}

module.exports = { getDb };
