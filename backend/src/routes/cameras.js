'use strict';

const router = require('express').Router();
const config = require('../config');
const { getDb } = require('../database');
const recordingService = require('../services/recordingService');
const { getStorageStats } = require('../services/storageService');

// GET /api/cameras — all camera statuses with config info
router.get('/', (req, res) => {
  try {
    const cfg = config.get();
    const db = getDb();
    const statuses = db.prepare(`SELECT * FROM camera_status`).all();
    const statusMap = {};
    statuses.forEach((s) => (statusMap[s.camera_id] = s));

    const result = Object.keys(cfg.cameras).map((camId) => {
      const cam = cfg.cameras[camId];
      const st = statusMap[camId] || {};
      return {
        id: camId,
        name: cam.name,
        ip: cam.ip,
        port: cam.port,
        enabled: cam.enabled,
        status: st.status || 'OFFLINE',
        lastSeen: st.last_seen || null,
        reconnectCount: st.reconnect_count || 0,
        recordingPid: st.recording_pid || null,
        currentSegment: st.current_segment || null,
        updatedAt: st.updated_at || null
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cameras/:id/start
router.post('/:id/start', (req, res) => {
  try {
    const camId = req.params.id;
    const state = recordingService.getCameraState(camId);
    if (state) state.stopped = false;
    recordingService.startCamera(camId);
    res.json({ ok: true, message: `${camId} recording started` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cameras/:id/stop
router.post('/:id/stop', (req, res) => {
  try {
    recordingService.stopCamera(req.params.id);
    res.json({ ok: true, message: `${req.params.id} recording stopped` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cameras/start-all
router.post('/start-all', (req, res) => {
  try {
    recordingService.startAll();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cameras/stop-all
router.post('/stop-all', (req, res) => {
  try {
    recordingService.stopAll();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
