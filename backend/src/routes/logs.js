'use strict';

const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { getDb } = require('../database');

// GET /api/logs?level=error&category=CAMERA&page=1&limit=100
router.get('/', (req, res) => {
  try {
    const { level, category, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = '1=1';
    const params = [];
    if (level)    { where += ' AND level = ?';    params.push(level); }
    if (category) { where += ' AND category = ?'; params.push(category); }

    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM activity_log WHERE ${where}`).get(...params);
    const rows = db.prepare(
      `SELECT * FROM activity_log WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(...params, parseInt(limit), offset);

    res.json({ total: total.cnt, page: parseInt(page), limit: parseInt(limit), data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs/file?type=record|error&lines=200
router.get('/file', (req, res) => {
  try {
    const cfg = config.get();
    const type = req.query.type === 'error' ? 'error.log' : 'record.log';
    const lines = parseInt(req.query.lines || 200);
    const filePath = path.join(cfg.logs.dir, type);

    if (!fs.existsSync(filePath)) return res.json({ lines: [] });

    const content = fs.readFileSync(filePath, 'utf-8');
    const all = content.split('\n').filter(Boolean);
    const tail = all.slice(-lines);

    res.json({ file: type, total: all.length, lines: tail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
