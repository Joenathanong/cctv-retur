'use client';

import React, { useEffect, useState } from 'react';
import { Save, RefreshCw, Eye, EyeOff, CheckCircle } from 'lucide-react';

export default function ConfigPage() {
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showPw, setShowPw] = useState({});

  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then(setCfg).catch(console.error);
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg)
      });
      if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    } catch (_) {}
    setSaving(false);
  };

  const update = (path, val) => {
    setCfg((c) => {
      const copy = JSON.parse(JSON.stringify(c));
      const parts = path.split('.');
      let cur = copy;
      for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
      cur[parts[parts.length - 1]] = val;
      return copy;
    });
  };

  if (!cfg) return <div className="text-slate-500 text-sm">Loading config...</div>;

  const cameraIds = Object.keys(cfg.cameras || {});

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Save bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between bg-surface py-2">
        <p className="text-xs text-slate-500">Perubahan hanya tersimpan setelah klik Save.</p>
        <div className="flex items-center gap-3">
          {saved && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle size={12} /> Tersimpan</span>}
          <button onClick={() => fetch('/api/config').then((r) => r.json()).then(setCfg)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
            <RefreshCw size={12} /> Reset
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            <Save size={14} /> {saving ? 'Menyimpan...' : 'Save Config'}
          </button>
        </div>
      </div>

      {/* Recording */}
      <Section title="Recording">
        <Field label="Base Dir" value={cfg.recording.baseDir} onChange={(v) => update('recording.baseDir', v)} />
        <Field label="Segment (menit)" type="number" value={cfg.recording.segmentMinutes} onChange={(v) => update('recording.segmentMinutes', +v)} />
        <Field label="Retensi (hari)" type="number" value={cfg.recording.retentionDays} onChange={(v) => update('recording.retentionDays', +v)} />
        <Field label="Default Last Duration (detik)" type="number" value={cfg.recording.defaultLastDurationSeconds} onChange={(v) => update('recording.defaultLastDurationSeconds', +v)} />
        {/* No Audio Toggle */}
        <div className="md:col-span-2">
          <div className="flex items-center justify-between bg-surface-muted border border-surface-border rounded-lg px-4 py-3">
            <div>
              <p className="text-sm text-slate-300 font-medium">Rekam Audio</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {cfg.recording.noAudio
                  ? 'Audio dinonaktifkan (-an) — hanya video. Lebih stabil, file lebih kecil.'
                  : 'Audio direkam bersama video. Aktifkan hanya jika diperlukan.'}
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer ml-4 shrink-0">
              <span className="text-xs text-slate-500">{cfg.recording.noAudio ? 'OFF' : 'ON'}</span>
              <div
                onClick={() => update('recording.noAudio', !cfg.recording.noAudio)}
                className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${!cfg.recording.noAudio ? 'bg-accent' : 'bg-slate-600'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${!cfg.recording.noAudio ? 'translate-x-5' : ''}`} />
              </div>
            </label>
          </div>
        </div>
      </Section>

      {/* Compression */}
      <CompressionSection cfg={cfg} update={update} />

      {/* Export & Excel */}
      <Section title="Export & Excel">
        <Field label="Export Dir" value={cfg.export.dir} onChange={(v) => update('export.dir', v)} />
        <Field label="Excel Watch Dir" value={cfg.excel.watchDir} onChange={(v) => update('excel.watchDir', v)} />
        <Field label="Buffer Awal Scan (detik)" type="number" value={cfg.export?.startBuffer ?? 5} onChange={(v) => update('export.startBuffer', +v)} />

        {/* End-of-shift buffer slider — full width */}
        <div className="md:col-span-2 space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-500">Buffer Akhir Shift</label>
            <span className="text-xs font-mono text-slate-300">
              {cfg.export?.endBuffer ?? 300}s&nbsp;
              <span className="text-slate-500">({fmtDuration(cfg.export?.endBuffer ?? 300)})</span>
            </span>
          </div>
          <input
            type="range" min={30} max={600} step={30}
            value={cfg.export?.endBuffer ?? 300}
            onChange={(e) => update('export.endBuffer', +e.target.value)}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[10px] text-slate-600">
            <span>30 dtk</span>
            <span>5 menit</span>
            <span>10 menit</span>
          </div>
          <p className="text-[10px] text-slate-600 mt-1">
            Durasi video setelah scan terakhir, jika tidak ada resi berikutnya di shift yang sama.
          </p>
        </div>

        <Field label="Kolom Resi (huruf/nama)" value={cfg.excel.columns.resi} onChange={(v) => update('excel.columns.resi', v)} placeholder="contoh: B" />
        <Field label="Kolom User (huruf/nama)" value={cfg.excel.columns.user} onChange={(v) => update('excel.columns.user', v)} placeholder="contoh: J" />
        <Field label="Kolom Scan Time (huruf/nama)" value={cfg.excel.columns.scanTime} onChange={(v) => update('excel.columns.scanTime', v)} placeholder="contoh: K" />
      </Section>

      {/* Database & Logs */}
      <Section title="Database & Logs">
        <Field label="Database Path" value={cfg.database.path} onChange={(v) => update('database.path', v)} />
        <Field label="Logs Dir" value={cfg.logs.dir} onChange={(v) => update('logs.dir', v)} />
      </Section>

      {/* FFmpeg */}
      <Section title="FFmpeg">
        <Field label="FFmpeg Path" value={cfg.ffmpeg.path} onChange={(v) => update('ffmpeg.path', v)} />
        <Field label="RTSP Transport" value={cfg.ffmpeg.rtspTransport} onChange={(v) => update('ffmpeg.rtspTransport', v)} />
        <Field label="Reconnect Delay (ms)" type="number" value={cfg.ffmpeg.reconnectDelay} onChange={(v) => update('ffmpeg.reconnectDelay', +v)} />
      </Section>

      {/* User-Camera Mapping */}
      <Section title="Mapping User → Camera">
        {Object.entries(cfg.userCameraMapping || {}).map(([user, cam]) => (
          <div key={user} className="flex items-center gap-3">
            <span className="text-slate-400 text-sm w-28">{user}</span>
            <span className="text-slate-600 text-sm">→</span>
            <input
              value={cam}
              onChange={(e) => update(`userCameraMapping.${user}`, e.target.value)}
              className="bg-surface-muted border border-surface-border rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent w-32"
            />
          </div>
        ))}
      </Section>

      {/* Cameras */}
      <Section title="Kamera">
        {cameraIds.map((camId) => {
          const cam = cfg.cameras[camId];
          return (
            <div key={camId} className="bg-surface-muted rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-300">{camId}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name" value={cam.name} onChange={(v) => update(`cameras.${camId}.name`, v)} />
                <Field label="IP" value={cam.ip} onChange={(v) => update(`cameras.${camId}.ip`, v)} />
                <Field label="Port" type="number" value={cam.port} onChange={(v) => update(`cameras.${camId}.port`, +v)} />
                <Field label="RTSP Path" value={cam.rtspPath} onChange={(v) => update(`cameras.${camId}.rtspPath`, v)} />
                <Field label="Username" value={cam.username} onChange={(v) => update(`cameras.${camId}.username`, v)} />
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Password</label>
                  <div className="relative">
                    <input
                      type={showPw[camId] ? 'text' : 'password'}
                      value={cam.password}
                      onChange={(e) => update(`cameras.${camId}.password`, e.target.value)}
                      className="w-full bg-surface-card border border-surface-border rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent pr-8"
                    />
                    <button type="button"
                      onClick={() => setShowPw((p) => ({ ...p, [camId]: !p[camId] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                      {showPw[camId] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id={`en_${camId}`} checked={cam.enabled}
                    onChange={(e) => update(`cameras.${camId}.enabled`, e.target.checked)}
                    className="accent-accent" />
                  <label htmlFor={`en_${camId}`} className="text-sm text-slate-400">Enabled</label>
                </div>
              </div>
            </div>
          );
        })}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-4">
      <p className="text-sm font-semibold text-slate-300 border-b border-surface-border pb-2">{title}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div>
      <label className="text-xs text-slate-500 mb-1 block">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        placeholder={placeholder ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface-muted border border-surface-border rounded px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-accent placeholder:text-slate-600"
      />
    </div>
  );
}

// ── Format seconds as human-readable duration ──────────────────────────────
function fmtDuration(sec) {
  if (sec < 60) return `${sec} detik`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} mnt ${s}s` : `${m} menit`;
}

// ── Estimated size reduction label based on CRF + resolution ──────────────
function sizeEstimate(enabled, resolution, crf) {
  if (!enabled) return { label: 'Original (stream copy)', color: 'text-slate-400' };
  let base = 100;
  if (resolution === '720p')  base = 45;
  if (resolution === '480p')  base = 20;
  if (crf <= 22) base = Math.round(base * 0.90);
  else if (crf <= 27) base = Math.round(base * 0.55);
  else if (crf <= 32) base = Math.round(base * 0.35);
  else if (crf <= 37) base = Math.round(base * 0.20);
  else base = Math.round(base * 0.12);
  const pct = Math.min(base, 100);
  const color = pct <= 20 ? 'text-success' : pct <= 40 ? 'text-accent' : pct <= 65 ? 'text-warning' : 'text-slate-400';
  return { label: `~${pct}% ukuran asli`, color };
}

function CompressionSection({ cfg, update }) {
  const comp    = cfg.recording?.compression ?? { enabled: false, encoder: 'nvenc', resolution: 'original', crf: 28, preset: 'fast' };
  const est     = sizeEstimate(comp.enabled, comp.resolution, comp.crf);
  const isNvenc = (comp.encoder ?? 'nvenc') === 'nvenc';

  const [compStatus, setCompStatus] = React.useState(null);

  React.useEffect(() => {
    const fetchStatus = () => {
      fetch('/api/config/compression-status')
        .then(r => r.json())
        .then(setCompStatus)
        .catch(() => {});
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const encoderDesc = {
    nvenc:    'h264_nvenc — GPU encode via NVIDIA CUDA. CPU hampir 0%, cocok untuk RTX/GTX.',
    software: 'libx264 — encode di CPU. Gunakan hanya jika tidak ada GPU NVIDIA.',
  };

  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-border pb-2">
        <div>
          <p className="text-sm font-semibold text-slate-300">Kompresi Video (Post-Process)</p>
          <p className="text-[10px] text-slate-600 mt-0.5">Kompresi dilakukan setelah rekaman selesai — tidak mempengaruhi stabilitas recording</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer shrink-0 ml-4">
          <span className="text-xs text-slate-500">{comp.enabled ? 'Aktif' : 'Nonaktif'}</span>
          <div
            onClick={() => update('recording.compression.enabled', !comp.enabled)}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${comp.enabled ? 'bg-accent' : 'bg-slate-600'}`}
          >
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${comp.enabled ? 'translate-x-5' : ''}`} />
          </div>
        </label>
      </div>

      {/* Info box */}
      <div className={`rounded-lg px-4 py-3 text-xs ${comp.enabled ? 'bg-accent/5 border border-accent/20' : 'bg-slate-800/50 border border-surface-border'}`}>
        {comp.enabled ? (
          <div className="space-y-1">
            <p className="text-slate-300">
              Recording selalu <strong>stream copy</strong> (paling stabil).{' '}
              Setelah segment selesai, dikompres otomatis ke H.264 di background.
            </p>
            <p className={isNvenc ? 'text-green-400' : 'text-warning'}>
              {encoderDesc[comp.encoder ?? 'nvenc']}
            </p>
          </div>
        ) : (
          <p className="text-slate-500">
            Mode <strong className="text-slate-400">Stream Copy</strong> — video disalin langsung tanpa re-encode.
            Kualitas maksimal, CPU/GPU minimal. Ukuran file = output asli kamera.
          </p>
        )}
      </div>

      {/* Compression status live */}
      {comp.enabled && compStatus && (
        <div className="flex items-center gap-4 text-xs px-3 py-2 bg-slate-800/60 rounded-lg border border-surface-border">
          <span className="text-slate-500">Status kompresi:</span>
          {compStatus.running ? (
            <span className="text-amber-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
              Mengompresi: <span className="font-mono">{compStatus.current}</span>
            </span>
          ) : compStatus.queued > 0 ? (
            <span className="text-slate-400">{compStatus.queued} file dalam antrian</span>
          ) : (
            <span className="text-slate-600">Tidak ada antrian</span>
          )}
          <span className="text-slate-600 ml-auto">✓ {compStatus.stats?.done ?? 0} selesai · ✗ {compStatus.stats?.failed ?? 0} gagal</span>
          <button
            onClick={() => fetch('/api/config/compression-scan', { method: 'POST' }).then(() => {})}
            className="text-slate-500 hover:text-slate-300 transition-colors text-[10px] border border-surface-border rounded px-2 py-0.5"
          >
            Scan sekarang
          </button>
        </div>
      )}

      <div className={`space-y-5 ${!comp.enabled ? 'opacity-40 pointer-events-none' : ''}`}>

        {/* Encoder selector */}
        <div>
          <label className="text-xs text-slate-500 mb-2 block">Encoder</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { val: 'nvenc',    label: 'NVIDIA GPU ★', sub: 'RTX/GTX — h264_nvenc, rekomendasi' },
              { val: 'software', label: 'Software CPU',  sub: 'libx264 — berat di CPU' },
            ].map(({ val, label, sub }) => (
              <button
                key={val}
                onClick={() => update('recording.compression.encoder', val)}
                className={`p-2.5 rounded-lg border text-left transition-colors ${
                  (comp.encoder ?? 'nvenc') === val
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-surface-border bg-surface-muted text-slate-400 hover:border-slate-500'
                }`}
              >
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-[10px] mt-0.5 opacity-70">{sub}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Resolusi */}
          <div>
            <label className="text-xs text-slate-500 mb-2 block">Resolusi Output</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: 'original', label: 'Original', sub: 'Sama dengan kamera' },
                { val: '1080p',    label: '1080p',    sub: '1920 × 1080' },
                { val: '720p',     label: '720p',     sub: '1280 × 720' },
                { val: '480p',     label: '480p',     sub: '854 × 480' },
              ].map(({ val, label, sub }) => (
                <button
                  key={val}
                  onClick={() => update('recording.compression.resolution', val)}
                  className={`p-2.5 rounded-lg border text-left transition-colors ${
                    comp.resolution === val
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-surface-border bg-surface-muted text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-[10px] mt-0.5 opacity-70">{sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* CQ/CRF + Preset */}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-500">{isNvenc ? 'Kualitas (CQ)' : 'Kualitas (CRF)'}</label>
                <span className="text-xs font-mono text-slate-300">{comp.crf}</span>
              </div>
              <input
                type="range" min={18} max={40} step={1}
                value={comp.crf}
                onChange={(e) => update('recording.compression.crf', +e.target.value)}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                <span>18 — Kualitas tinggi</span>
                <span>40 — File kecil</span>
              </div>
              <div className="flex gap-3 mt-2">
                {[
                  { label: 'Tinggi', crf: 22 },
                  { label: 'Sedang', crf: 28 },
                  { label: 'Rendah', crf: 34 },
                ].map(({ label, crf }) => (
                  <button key={crf} onClick={() => update('recording.compression.crf', crf)}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      comp.crf === crf ? 'border-accent text-accent' : 'border-surface-border text-slate-500 hover:border-slate-500'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Preset */}
            <div>
              <label className="text-xs text-slate-500 mb-2 block">
                Preset {isNvenc ? <span className="text-slate-600">(ultrafast=p1 · veryfast=p3 · fast=p4 · medium=p5)</span> : ''}
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { val: 'ultrafast', label: 'Ultrafast', sub: isNvenc ? 'p1 — tercepat'        : 'CPU ringan, file besar' },
                  { val: 'veryfast',  label: 'Veryfast',  sub: isNvenc ? 'p3'                    : 'Real-time bagus' },
                  { val: 'fast',      label: 'Fast ★',    sub: isNvenc ? 'p4 — rekomendasi'      : 'Balance CPU/ukuran' },
                  { val: 'medium',    label: 'Medium',    sub: isNvenc ? 'p5 — file lebih kecil' : 'File kecil, CPU berat' },
                ].map(({ val, label, sub }) => (
                  <button key={val} onClick={() => update('recording.compression.preset', val)}
                    className={`p-2 rounded border text-left transition-colors ${
                      comp.preset === val
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-surface-border bg-surface-muted text-slate-400 hover:border-slate-500'
                    }`}>
                    <p className="text-xs font-medium">{label}</p>
                    <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Size estimate */}
      <div className="flex items-center gap-2 pt-1 border-t border-surface-border">
        <span className="text-xs text-slate-500">Estimasi ukuran file:</span>
        <span className={`text-xs font-semibold ${est.color}`}>{est.label}</span>
        {comp.enabled && (
          <span className="text-[10px] text-slate-600 ml-1">
            (perkiraan kasar — tergantung konten video)
          </span>
        )}
      </div>
    </div>
  );
}
