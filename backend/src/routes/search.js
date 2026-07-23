'use strict';

const router = require('express').Router();
const { searchResi } = require('../services/exportService');

// GET /api/search?resi=SPX001
// Supports exact match (returns single object) or partial LIKE match (returns { multiple:true, results:[] }).
router.get('/', (req, res) => {
  try {
    const { resi } = req.query;
    if (!resi) return res.status(400).json({ error: 'resi parameter required' });

    const query = resi.trim().toUpperCase();

    // Exact match → return single result (backward compatible)
    const exact = searchResi(query);
    if (exact) return res.json(exact);

    // Partial match → return list of candidates
    const { getDb } = require('../database');
    const db = getDb();
    const rows = db.prepare(`
      SELECT resi, user, camera, scan_date, start_time, end_time, status, exported, export_path
      FROM scan_logs
      WHERE UPPER(resi) LIKE ?
      ORDER BY scan_date DESC, start_time DESC
      LIMIT 30
    `).all(`%${query}%`);

    if (!rows.length) {
      return res.status(404).json({ error: `Resi "${resi}" tidak ditemukan` });
    }

    res.json({ multiple: true, results: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
