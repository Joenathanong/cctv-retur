'use strict';

const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { importExcel } = require('../services/excelService');
const { getDb } = require('../database');

// POST /api/excel/import — upload file and import
router.post('/import', (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded. Use multipart field "file".' });
    }

    const cfg = config.get();
    const uploadDir = path.join(cfg.excel.watchDir);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const file = req.files.file;
    const savePath = path.join(uploadDir, file.name);
    file.mv(savePath, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      const result = importExcel(savePath);
      res.json({ ok: true, file: file.name, ...result });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/excel/import-path — import from server-side path
router.post('/import-path', (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath required' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found: ' + filePath });
    const result = importExcel(filePath);
    res.json({ ok: true, file: path.basename(filePath), ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/excel/scans/all  { password: "..." }
// Hapus semua data scan_logs (untuk upload ulang dari awal).
router.delete('/scans/all', (req, res) => {
  try {
    const { password } = req.body;
    if (password !== 'IEGp@ssw0rd') {
      return res.status(401).json({ error: 'Password salah' });
    }
    const db = getDb();
    const result = db.prepare(`DELETE FROM scan_logs`).run();
    res.json({ ok: true, deleted: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/excel/scans?date=YYYY-MM-DD&user=Bongkar01&page=1&limit=100
router.get('/scans', (req, res) => {
  try {
    const { date, user, camera, resi, status, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = '1=1';
    const params = [];
    if (date)   { where += ' AND scan_date = ?';  params.push(date); }
    if (user)   { where += ' AND user = ?';        params.push(user); }
    if (camera) { where += ' AND camera = ?';      params.push(camera); }
    if (resi)   { where += ' AND resi LIKE ?';     params.push(`%${resi}%`); }
    if (status) { where += ' AND status = ?';      params.push(status); }

    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) as cnt FROM scan_logs WHERE ${where}`).get(...params);
    const rows = db.prepare(
      `SELECT * FROM scan_logs WHERE ${where} ORDER BY scan_date DESC, start_time ASC LIMIT ? OFFSET ?`
    ).all(...params, parseInt(limit), offset);

    res.json({ total: total.cnt, page: parseInt(page), limit: parseInt(limit), data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
