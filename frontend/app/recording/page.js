'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Video, Database } from 'lucide-react';

function fmtBytes(b) {
  if (!b) return '0 B';
  if (b > 1e9) return (b / 1e9).toFixed(2) + ' GB';
  if (b > 1e6) return (b / 1e6).toFixed(1) + ' MB';
  return (b / 1e3).toFixed(0) + ' KB';
}

export default function RecordingPage() {
  const [data, setData] = useState({ total: 0, data: [] });
  const [filters, setFilters] = useState({ date: '', camera: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const p = new URLSearchParams({ page, limit: 100, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
    try {
      const r = await fetch(`/api/recordings?${p}`);
      setData(await r.json());
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [page, filters]);

  const sync = async () => {
    await fetch('/api/recordings/sync', { method: 'POST' });
    load();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="date"
          value={filters.date}
          onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))}
          className="bg-surface-muted border border-surface-border rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-accent"
        />
        <input
          type="text"
          placeholder="Camera ID (CAM01)"
          value={filters.camera}
          onChange={(e) => setFilters((f) => ({ ...f, camera: e.target.value }))}
          className="bg-surface-muted border border-surface-border rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-accent w-44"
        />
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover transition-colors">
          <RefreshCw size={13} /> Refresh
        </button>
        <button onClick={sync} className="flex items-center gap-2 px-3 py-2 bg-surface-muted text-slate-400 border border-surface-border rounded-lg text-sm hover:text-white transition-colors ml-auto">
          <Database size={13} /> Sync DB
        </button>
        <span className="text-xs text-slate-500">{data.total} file</span>
      </div>

      {/* Table */}
      <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-surface-border bg-surface-muted text-slate-400 uppercase tracking-wide text-[10px]">
              <th className="text-left px-4 py-3">Camera</th>
              <th className="text-left px-4 py-3">Date</th>
              <th className="text-left px-4 py-3">File</th>
              <th className="text-left px-4 py-3">Start</th>
              <th className="text-right px-4 py-3">Size</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-600">Loading...</td></tr>
            )}
            {!loading && data.data.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-600">Tidak ada data</td></tr>
            )}
            {data.data.map((r) => (
              <tr key={r.id} className="border-b border-surface-border/50 hover:bg-surface-muted transition-colors">
                <td className="px-4 py-2.5 text-slate-300 font-medium">{r.camera_id}</td>
                <td className="px-4 py-2.5 text-slate-400">{r.record_date}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Video size={12} className="text-accent" />
                    {r.file_name}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-slate-400">{r.start_ts}</td>
                <td className="px-4 py-2.5 text-right text-slate-400">{fmtBytes(r.size_bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
