'use client';

import { useEffect, useState } from 'react';
import { HardDrive, Trash2, RefreshCw } from 'lucide-react';

function fmtBytes(b) {
  if (!b) return '0 B';
  if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB';
  if (b >= 1e9)  return (b / 1e9).toFixed(2) + ' GB';
  if (b >= 1e6)  return (b / 1e6).toFixed(1) + ' MB';
  return (b / 1e3).toFixed(0) + ' KB';
}

export default function StoragePage() {
  const [stats, setStats] = useState(null);
  const [breakdown, setBreakdown] = useState([]);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState(null);

  const load = async () => {
    try {
      const [s, b] = await Promise.all([
        fetch('/api/storage/stats').then((r) => r.json()),
        fetch('/api/storage/breakdown').then((r) => r.json())
      ]);
      setStats(s);
      setBreakdown(b);
    } catch (_) {}
  };

  useEffect(() => { load(); }, []);

  const doCleanup = async () => {
    setCleaning(true);
    setCleanResult(null);
    try {
      const r = await fetch('/api/storage/cleanup', { method: 'POST' });
      const d = await r.json();
      setCleanResult(d);
      load();
    } catch (_) {}
    setCleaning(false);
  };

  const pct = stats?.total ? Math.round((stats.used / stats.total) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Digunakan', value: fmtBytes(stats?.used), color: 'text-accent' },
          { label: 'Tersisa',   value: fmtBytes(stats?.free), color: 'text-success' },
          { label: 'Total',     value: fmtBytes(stats?.total), color: 'text-slate-300' }
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface-card border border-surface-border rounded-lg p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value || '—'}</p>
          </div>
        ))}
      </div>

      {/* Usage bar */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-4">
        <div className="flex justify-between text-xs text-slate-400 mb-2">
          <span>Penggunaan Storage</span>
          <span>{pct}%</span>
        </div>
        <div className="w-full bg-surface-muted rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full ${pct > 85 ? 'bg-danger' : pct > 60 ? 'bg-warning' : 'bg-accent'}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-slate-600 mt-2">{stats?.fileCount ?? 0} file recording tersimpan</p>
      </div>

      {/* Cleanup */}
      <div className="flex items-center gap-3">
        <button
          onClick={doCleanup}
          disabled={cleaning}
          className="flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger border border-danger/30 rounded-lg text-sm hover:bg-danger/20 transition-colors disabled:opacity-50"
        >
          <Trash2 size={14} /> {cleaning ? 'Membersihkan...' : 'Jalankan Retention Cleanup'}
        </button>
        <button onClick={load} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>
        {cleanResult && (
          <p className="text-xs text-success">Dihapus {cleanResult.deletedFolders} folder</p>
        )}
      </div>

      {/* Breakdown table */}
      <div>
        <p className="text-sm font-medium text-slate-300 mb-3">Breakdown per Camera & Tanggal</p>
        <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-border bg-surface-muted text-slate-500 uppercase tracking-wide text-[10px]">
                <th className="text-left px-4 py-3">Camera</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-right px-4 py-3">Segments</th>
                <th className="text-right px-4 py-3">Size</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.length === 0 && (
                <tr><td colSpan={4} className="text-center py-6 text-slate-600">Tidak ada data</td></tr>
              )}
              {breakdown.map((r, i) => (
                <tr key={i} className="border-b border-surface-border/50 hover:bg-surface-muted transition-colors">
                  <td className="px-4 py-2.5 text-accent font-medium">{r.camera_id}</td>
                  <td className="px-4 py-2.5 text-slate-400">{r.record_date}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{r.segments}</td>
                  <td className="px-4 py-2.5 text-right text-slate-300">{fmtBytes(r.total_bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
