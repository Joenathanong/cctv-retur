'use strict';

const router = require('express').Router();
const { getStorageStats, enforceRetention, syncRecordingsToDb } = require('../services/storageService');
const { getDb } = require('../database');

// GET /api/storage/stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await getStorageStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/storage/cleanup
router.post('/cleanup', (req, res) => {
  try {
    const deleted = enforceRetention();
    res.json({ ok: true, deletedFolders: deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/storage/breakdown — per camera per date
router.get('/breakdown', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT camera_id, record_date,
             COUNT(*) as segments,
             SUM(size_bytes) as total_bytes
      FROM recordings
      GROUP BY camera_id, record_date
      ORDER BY record_date DESC, camera_id
    `).all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
