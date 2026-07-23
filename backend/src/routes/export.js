'use strict';

const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { exportByResi } = require('../services/exportService');

// POST /api/export  { resi: "SPX001" }
router.post('/', async (req, res) => {
  try {
    const { resi } = req.body;
    if (!resi) return res.status(400).json({ error: 'resi required' });

    const outputPath = await exportByResi(resi.trim().toUpperCase());
    const stat = fs.statSync(outputPath);

    res.json({
      ok: true,
      resi,
      file: path.basename(outputPath),
      path: outputPath,
      size: stat.size
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/download/:resi — stream file to browser
router.get('/download/:resi', (req, res) => {
  try {
    const config = require('../config').get();
    const resi = req.params.resi.toUpperCase();
    const filePath = path.join(config.export.dir, `${resi}.mp4`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `Export file not found for ${resi}` });
    }

    const stat = fs.statSync(filePath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${resi}.mp4"`);
    res.setHeader('Content-Length', stat.size);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', (err) => res.status(500).end(err.message));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/export/all  { password: "..." }
// Hapus semua file export dan reset status di DB.
router.delete('/all', (req, res) => {
  try {
    const { password } = req.body;
    if (password !== 'IEGp@ssw0rd') {
      return res.status(401).json({ error: 'Password salah' });
    }

    const config = require('../config').get();
    const { getDb } = require('../database');
    const db = getDb();

    // Hapus semua .mp4 di export dir (termasuk subfolder _tmp)
    const exportDir = config.export?.dir;
    let deletedFiles = 0;
    if (exportDir && fs.existsSync(exportDir)) {
      const deleteInDir = (dir) => {
        try {
          fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              deleteInDir(full);
            } else if (entry.name.endsWith('.mp4') || entry.name.endsWith('.ts')) {
              try { fs.unlinkSync(full); deletedFiles++; } catch (_) {}
            }
          });
        } catch (_) {}
      };
      deleteInDir(exportDir);
    }

    // Reset DB: semua record exported=1 dikembalikan ke pending
    const result = db.prepare(`
      UPDATE scan_logs SET exported = 0, export_path = NULL, status = 'pending'
      WHERE exported = 1
    `).run();

    res.json({ ok: true, files_deleted: deletedFiles, records_reset: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/export/list
router.get('/list', (req, res) => {
  try {
    const { getDb } = require('../database');
    const db = getDb();
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const total = db.prepare(`SELECT COUNT(*) as cnt FROM scan_logs WHERE exported = 1`).get();
    const rows = db.prepare(
      `SELECT resi, user, camera, scan_date, start_time, end_time, export_path, created_at
       FROM scan_logs WHERE exported = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).all(parseInt(limit), offset);

    res.json({ total: total.cnt, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
