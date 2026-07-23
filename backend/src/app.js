'use strict';

const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const cron = require('node-cron');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const { getDb } = require('./database');
const recordingService = require('./services/recordingService');
const compressionService = require('./services/compressionService');
const { enforceRetention, syncRecordingsToDb, checkDayRollover } = require('./services/storageService');

// Routes
const dashboardRoute  = require('./routes/dashboard');
const camerasRoute    = require('./routes/cameras');
const recordingsRoute = require('./routes/recordings');
const excelRoute      = require('./routes/excel');
const searchRoute     = require('./routes/search');
const exportRoute     = require('./routes/export');
const configRoute     = require('./routes/configRoute');
const storageRoute    = require('./routes/storage');
const logsRoute       = require('./routes/logs');

// ─── App setup ─────────────────────────────────────────────────────────────

const app = express();
const cfg = config.get();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 }, useTempFiles: false }));

// API routes
app.use('/api/dashboard',   dashboardRoute);
app.use('/api/cameras',     camerasRoute);
app.use('/api/recordings',  recordingsRoute);
app.use('/api/excel',       excelRoute);
app.use('/api/search',      searchRoute);
app.use('/api/export',      exportRoute);
app.use('/api/config',      configRoute);
app.use('/api/storage',     storageRoute);
app.use('/api/logs',        logsRoute);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// 404 catch-all
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: err.message });
});

// ─── Scheduler ─────────────────────────────────────────────────────────────

function setupScheduler() {
  // Storage retention: daily at 01:00
  cron.schedule('0 1 * * *', () => {
    logger.info('[Scheduler] Running retention cleanup...');
    enforceRetention();
  });

  // Sync recordings to DB: every 15 minutes
  cron.schedule('*/15 * * * *', () => {
    syncRecordingsToDb();
  });

  // Day rollover check: every hour at :01
  cron.schedule('1 * * * *', () => {
    recordingService.checkDayRollover();
  });

  // Post-process compression scan: every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    compressionService.scan();
  });

  logger.info('[Scheduler] Cron jobs registered.');
}

// ─── Boot ───────────────────────────────────────────────────────────────────

async function boot() {
  logger.info('=== Warehouse CCTV System Starting ===');

  // Init DB
  getDb();
  logger.info('[Boot] Database initialized.');

  // Sync existing recordings
  syncRecordingsToDb();
  logger.info('[Boot] Recordings synced.');

  // Init compression service (post-process mode)
  compressionService.init(() => recordingService.getActiveSegmentPaths());
  logger.info('[Boot] Compression service initialized.');

  // Start all cameras
  recordingService.startAll();
  logger.info('[Boot] Recording started for all enabled cameras.');

  // Setup cron
  setupScheduler();

  // Listen
  const PORT = cfg.server.port || 3001;
  const HOST = cfg.server.host || '0.0.0.0';

  app.listen(PORT, HOST, () => {
    logger.info(`[Boot] Server running at http://${HOST}:${PORT}`);
  });
}

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Stopping all recordings...');
  recordingService.stopAll();
  process.exit(0);
});
process.on('SIGINT', () => {
  logger.info('SIGINT received. Stopping all recordings...');
  recordingService.stopAll();
  process.exit(0);
});

boot().catch((err) => {
  logger.error(`Boot failed: ${err.message}`);
  process.exit(1);
});

module.exports = app;
