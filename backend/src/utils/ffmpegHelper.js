'use strict';

const fs     = require('fs');
const { spawn } = require('child_process');
const path   = require('path');
const config = require('../config');
const logger = require('./logger');

/**
 * Build segment output pattern for a camera.
 * Records as .ts (MPEG-TS) — immediately playable while recording.
 * Output: <baseDir>/<camId>/<YYYY-MM-DD>/<HHmm>.ts
 */
function getSegmentPattern(camId, date) {
  const cfg = config.get();
  const dateStr = date || new Date().toISOString().slice(0, 10);
  const dir = path.join(cfg.recording.baseDir, camId, dateStr);
  return { dir, pattern: path.join(dir, '%H%M.ts') };
}

/**
 * Resolusi → skala FFmpeg. "original" = tanpa scale filter.
 */
const RESOLUTION_SCALE = {
  '1080p': '1920:1080',
  '720p':  '1280:720',
  '480p':  '854:480'
};

/**
 * Preset UI → NVENC preset (p1=fastest/besar, p7=lambat/kecil).
 * p4 = balanced, cocok untuk real-time recording.
 */
const NVENC_PRESET_MAP = {
  'ultrafast': 'p1',
  'veryfast':  'p3',
  'fast':      'p4',
  'medium':    'p5'
};

/**
 * Launch an FFmpeg process that records from RTSP in segments.
 *
 * ⚠️  SELALU menggunakan stream copy (-c:v copy).
 * Kompresi TIDAK dilakukan di sini — diserahkan ke compressionService
 * setelah segment selesai direkam (post-process).
 * Ini menjaga pipeline RTSP sesederhana mungkin dan mencegah
 * beban encoder menyebabkan disconnect.
 */
function startRecording(camId, rtspUrl, outputDir, outputPattern) {
  const cfg        = config.get();
  const segSeconds = cfg.recording.segmentMinutes * 60;
  const noAudio    = cfg.recording.noAudio === true;

  // Stream copy — no re-encode, minimal CPU/GPU load
  const codecArgs = noAudio
    ? ['-c:v', 'copy', '-an']
    : ['-c:v', 'copy', '-c:a', 'copy'];

  logger.info(`[${camId}] Recording: stream copy, audio=${noAudio ? 'OFF' : 'ON'}`);

  const args = [
    '-loglevel',  'warning',
    '-rtsp_transport', cfg.ffmpeg.rtspTransport,
    '-timeout',   '10000000',           // connection + socket timeout 10 s
    '-use_wallclock_as_timestamps', '1',
    '-i', rtspUrl,
    '-fflags', '+genpts+discardcorrupt',
    ...codecArgs,
    '-f',              'segment',
    '-segment_time',   String(segSeconds),
    '-segment_format', 'mpegts',
    '-strftime',       '1',
    '-reset_timestamps', '1',
    '-avoid_negative_ts', 'make_zero',
    outputPattern
  ];

  logger.info(`[${camId}] Starting FFmpeg: ${cfg.ffmpeg.path} ${args.slice(2).join(' ')}`);

  const proc = spawn(cfg.ffmpeg.path, args, {
    stdio:       ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  proc.stdout.on('data', (d) => logger.info(`[${camId}] ffmpeg stdout: ${d.toString().trim()}`));
  proc.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) logger.warn(`[${camId}] ffmpeg: ${msg}`);
  });

  return proc;
}

/**
 * Compress a completed .ts segment in-place (post-process).
 * Dipanggil hanya oleh compressionService — TIDAK saat recording berlangsung.
 *
 * Alur:
 *   1. Kompresi inputFile → inputFile.compressing  (NVENC atau libx264)
 *   2. Hapus original inputFile
 *   3. Rename .compressing → inputFile
 *
 * Jika gagal: temp file dibersihkan, original tetap utuh.
 *
 * @param {string} inputFile   Full path ke .ts file yang sudah selesai
 * @param {object} comp        { encoder, crf, preset, resolution }
 * @returns {Promise<string>}  Resolve dengan inputFile path jika sukses
 */
function compressSegment(inputFile, comp) {
  const cfg     = config.get();
  const tmpFile = inputFile + '.compressing';

  const crf     = comp.crf     ?? 28;
  const preset  = comp.preset  ?? 'veryfast';
  const encoder = comp.encoder ?? 'nvenc';
  const scale   = RESOLUTION_SCALE[comp.resolution];

  let hwAccelArgs = [];
  let codecArgs;

  if (encoder === 'nvenc') {
    hwAccelArgs = ['-hwaccel', 'cuda'];
    const nvPreset = NVENC_PRESET_MAP[preset] || 'p4';
    codecArgs = [
      ...(scale ? ['-vf', `scale=${scale}`] : []),
      '-c:v', 'h264_nvenc',
      '-cq',     String(crf),
      '-preset', nvPreset,
      '-an'                               // archive tanpa audio
    ];
    logger.info(`[compress] ${path.basename(inputFile)}: NVENC cq=${crf} preset=${nvPreset} res=${comp.resolution ?? 'original'}`);
  } else {
    codecArgs = [
      ...(scale ? ['-vf', `scale=${scale}`] : []),
      '-c:v', 'libx264',
      '-crf',    String(crf),
      '-preset', preset,
      '-an'
    ];
    logger.info(`[compress] ${path.basename(inputFile)}: libx264 crf=${crf} preset=${preset} res=${comp.resolution ?? 'original'}`);
  }

  const args = [
    '-y',
    '-loglevel', 'warning',
    ...hwAccelArgs,
    '-i', inputFile,
    ...codecArgs,
    '-f', 'mpegts',
    tmpFile
  ];

  return new Promise((resolve, reject) => {
    const proc = spawn(cfg.ffmpeg.path, args, {
      stdio:       ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          // Replace original dengan versi terkompresi
          fs.unlinkSync(inputFile);
          fs.renameSync(tmpFile, inputFile);
          resolve(inputFile);
        } catch (err) {
          try { fs.unlinkSync(tmpFile); } catch (_) {}
          reject(new Error(`File swap gagal: ${err.message}`));
        }
      } else {
        try { fs.unlinkSync(tmpFile); } catch (_) {}
        reject(new Error(`FFmpeg compress exited ${code}: ${stderr.slice(-400)}`));
      }
    });

    proc.on('error', (err) => {
      try { fs.unlinkSync(tmpFile); } catch (_) {}
      reject(err);
    });
  });
}

/**
 * Clip a segment of video from a source file.
 * Input: .ts file.
 * Output format is auto-detected from outputFile extension:
 *   .ts  → MPEG-TS  (used for intermediate clips before concat)
 *   .mp4 → MP4 with faststart (used for final single-segment export)
 */
function clipVideo(inputFile, outputFile, startSec, durationSec) {
  const cfg = config.get();
  const isTs = outputFile.toLowerCase().endsWith('.ts');
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-ss', String(startSec),
      '-i', inputFile,
      '-t', String(durationSec),
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-avoid_negative_ts', 'make_zero',
      ...(isTs ? ['-f', 'mpegts'] : ['-movflags', '+faststart']),
      outputFile
    ];

    const proc = spawn(cfg.ffmpeg.path, args, {
      stdio:       ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve(outputFile);
      else reject(new Error(`FFmpeg clip exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', reject);
  });
}

/**
 * Concatenate multiple .ts files into one .mp4 output.
 *
 * Strategy:
 *   1. Binary-concat all .ts parts in Node.js (MPEG-TS natively supports binary concat).
 *   2. Remux the merged .ts → .mp4 with a single FFmpeg call (-c copy).
 *
 * This avoids FFmpeg's concat demuxer list file entirely, which has known
 * path-resolution problems on Windows (drive-letter + forward-slash combos).
 */
async function concatVideos(files, outputFile, _tmpListFile) {
  const cfg = config.get();
  const rawTs = outputFile.replace(/\.mp4$/i, '_concat.ts');

  // Step 1: Stream-concat all .ts parts into one raw .ts file
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(rawTs);
    out.on('error', reject);
    out.on('finish', resolve);
    let i = 0;
    function next() {
      if (i >= files.length) { out.end(); return; }
      const rs = fs.createReadStream(files[i++]);
      rs.on('error', reject);
      rs.on('end', next);
      rs.pipe(out, { end: false });
    }
    next();
  });

  // Step 2: Remux raw .ts → .mp4 (stream copy, no re-encode)
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', rawTs,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputFile
    ];
    const proc = spawn(cfg.ffmpeg.path, args, {
      stdio:       ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      try { fs.unlinkSync(rawTs); } catch (_) {}
      if (code === 0) resolve(outputFile);
      else reject(new Error(`FFmpeg remux exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', (err) => {
      try { fs.unlinkSync(rawTs); } catch (_) {}
      reject(err);
    });
  });
}

/**
 * Probe video file to get duration in seconds.
 */
function probeDuration(filePath) {
  const cfg = require('../config').get();
  const ffprobePath = cfg.ffmpeg.path.replace('ffmpeg.exe', 'ffprobe.exe').replace(/ffmpeg$/, 'ffprobe');
  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ];
    const proc = spawn(ffprobePath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('close', () => resolve(parseFloat(out.trim()) || 0));
    proc.on('error', () => resolve(0));
  });
}

/**
 * Probe the first video packet's PTS (seconds) from a file.
 * Used to detect whether segment timestamps are:
 *   - 0-based  (reset_timestamps worked):     firstPts ≈ 0
 *   - wall-clock (seconds from midnight):     firstPts ≈ segment start (e.g. 51000 for 14:10)
 *
 * @returns {Promise<number>} first PTS in seconds, or 0 on error
 */
function probeStartTs(filePath) {
  const cfg = require('../config').get();
  const ffprobePath = cfg.ffmpeg.path.replace(/ffmpeg(\.exe)?$/i, (_, ext) => `ffprobe${ext || ''}`);
  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'packet=pts_time',
      '-of', 'csv=print_section=0',
      '-read_intervals', '%+#1',   // read only the first packet
      filePath
    ];
    const proc = spawn(ffprobePath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.on('close', () => resolve(parseFloat(out.trim()) || 0));
    proc.on('error', () => resolve(0));
  });
}

module.exports = { getSegmentPattern, startRecording, compressSegment, clipVideo, concatVideos, probeDuration, probeStartTs };
