'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '../../../config/config.json');

let _config = null;

function load() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  _config = JSON.parse(raw);
  return _config;
}

function get() {
  if (!_config) load();
  return _config;
}

function save(newConfig) {
  _config = newConfig;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
}

/**
 * Build RTSP URL for a camera from config.
 * Format: rtsp://username:password@ip:port/rtspPath
 */
function getRtspUrl(camId) {
  const cfg = get();
  const cam = cfg.cameras[camId];
  if (!cam) throw new Error(`Camera ${camId} not found in config`);
  // Encode special chars in credentials (e.g. @ -> %40, # -> %23)
  const user = encodeURIComponent(cam.username);
  const pass = encodeURIComponent(cam.password);
  return `rtsp://${user}:${pass}@${cam.ip}:${cam.port}${cam.rtspPath}`;
}

module.exports = { get, save, load, getRtspUrl };
