'use strict';

const router = require('express').Router();
const { getDb } = require('../database');
const { getStorageStats } = require('../services/storageService');

router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0, 10);

    const cameraRows = db.prepare(`SELECT status FROM camera_status`).all();
    const online = cameraRows.filter((r) => r.status === 'ONLINE').length;
    const offline = cameraRows.filter((r) => r.status !== 'ONLINE').length;

    const totalCameras = online + offline;

    const scansToday = db.prepare(`SELECT COUNT(*) as cnt FROM scan_logs WHERE scan_date = ?`).get(today);
    const exportsToday = db.prepare(
      `SELECT COUNT(*) as cnt FROM scan_logs WHERE scan_date = ? AND exported = 1`
    ).get(today);
    const totalScans = db.prepare(`SELECT COUNT(*) as cnt FROM scan_logs`).get();

    const recToday = db.prepare(`SELECT COUNT(*) as cnt FROM recordings WHERE record_date = ?`).get(today);

    const storage = await getStorageStats();

    res.json({
      cameras: { online, offline, total: totalCameras },
      storage: {
        used: storage.used,
        free: storage.free,
        total: storage.total,
        files: storage.fileCount
      },
      recordings: { today: recToday.cnt },
      exports: { today: exportsToday.cnt },
      scans: { today: scansToday.cnt, total: totalScans.cnt }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
