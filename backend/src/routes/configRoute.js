'use strict';

const router = require('express').Router();
const config = require('../config');
const compressionService = require('../services/compressionService');

// GET /api/config
router.get('/', (req, res) => {
  try {
    const cfg = config.get();
    // Strip passwords for display? Keep them since this is LAN-only internal tool.
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/config — save full config
router.put('/', (req, res) => {
  try {
    const newCfg = req.body;
    if (!newCfg || typeof newCfg !== 'object') {
      return res.status(400).json({ error: 'Invalid config body' });
    }
    config.save(newCfg);
    res.json({ ok: true, message: 'Config saved' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/config — partial update (merge)
router.patch('/', (req, res) => {
  try {
    const current = config.get();
    const patch = req.body;
    const merged = deepMerge(current, patch);
    config.save(merged);
    res.json({ ok: true, config: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/config/compression-status — status antrian kompresi
router.get('/compression-status', (req, res) => {
  res.json(compressionService.getStatus());
});

// POST /api/config/compression-scan — paksa scan sekarang
router.post('/compression-scan', (req, res) => {
  compressionService.forceScan();
  res.json({ ok: true, message: 'Scan dimulai.' });
});

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === 'object'
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

module.exports = router;
