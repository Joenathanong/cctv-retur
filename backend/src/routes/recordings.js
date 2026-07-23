'use strict';

const router = require('express').Router();
const { getDb } = require('../database');
const { syncRecordingsToDb } = require('../services/storageService');

// GET /api/recordings?date=YYYY-MM-DD&camera=CAM01&page=1&limit=50
router.get('/', (req, res) => {
  try {
    const { date, camera, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = '1=1';
    const params = [];
    if (date) { where += ' AND record_date = ?'; params.push(date); }
    if (camera) { where += ' AND camera_id = ?'; params.push(camera); }

    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM recordings WHERE ${where}`).get(...params);
    const rows = db.prepare(
      `SELECT * FROM recordings WHERE ${where} ORDER BY record_date DESC, start_ts DESC LIMIT ? OFFSET ?`
    ).all(...params, parseInt(limit), offset);

    res.json({ total: total.cnt, page: parseInt(page), limit: parseInt(limit), data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recordings/sync  — re-scan disk and sync to DB
router.post('/sync', (req, res) => {
  try {
    syncRecordingsToDb();
    res.json({ ok: true, message: 'Recordings synced to database' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
