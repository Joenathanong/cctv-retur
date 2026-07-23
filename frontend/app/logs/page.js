'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const levelIcon = { error: AlertCircle, warn: AlertTriangle, info: Info };
const levelColor = {
  error: 'text-danger',
  warn:  'text-warning',
  info:  'text-slate-400'
};

export default function LogsPage() {
  const [logs, setLogs] = useState({ total: 0, data: [] });
  const [filters, setFilters] = useState({ level: '', category: '' });
  const [tab, setTab] = useState('db'); // 'db' | 'file'
  const [fileLog, setFileLog] = useState({ lines: [] });
  const [fileType, setFileType] = useState('record');
  const [loading, setLoading] = useState(false);

  const loadDb = async () => {
    setLoading(true);
    const p = new URLSearchParams({ limit: 200, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) });
    try {
      const r = await fetch(`/api/logs?${p}`);
      setLogs(await r.json());
    } catch (_) {}
    setLoading(false);
  };

  const loadFile = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/logs/file?type=${fileType}&lines=300`);
      setFileLog(await r.json());
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { if (tab === 'db') loadDb(); else loadFile(); }, [tab, filters, fileType]);

  const refresh = () => tab === 'db' ? loadDb() : loadFile();

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-surface-muted p-1 rounded-lg w-fit">
        {['db', 'file'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm rounded transition-colors ${tab === t ? 'bg-surface-card text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>
            {t === 'db' ? 'Activity Log' : 'File Log'}
          </button>
        ))}
      </div>

      {/* DB Log */}
      {tab === 'db' && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <select value={filters.level} onChange={(e) => setFilters((f) => ({ ...f, level: e.target.value }))}
              className="bg-surface-muted border border-surface-border rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none">
              <option value="">All Levels</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
            <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="bg-surface-muted border border-surface-border rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none">
              <option value="">All Categories</option>
              <option value="RECORDING">RECORDING</option>
              <option value="CAMERA">CAMERA</option>
              <option value="EXCEL">EXCEL</option>
              <option value="EXPORT">EXPORT</option>
              <option value="STORAGE">STORAGE</option>
            </select>
            <button onClick={refresh} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors ml-auto">
              <RefreshCw size={12} /> Refresh
            </button>
            <span className="text-xs text-slate-600">{logs.total} entries</span>
          </div>

          <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-border bg-surface-muted text-slate-500 uppercase tracking-wide text-[10px]">
                  <th className="text-left px-4 py-2.5 w-32">Time</th>
                  <th className="text-left px-4 py-2.5 w-16">Level</th>
                  <th className="text-left px-4 py-2.5 w-24">Category</th>
                  <th className="text-left px-4 py-2.5">Message</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={4} className="text-center py-6 text-slate-600">Loading...</td></tr>}
                {!loading && logs.data.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-slate-600">Tidak ada log</td></tr>}
                {logs.data.map((l) => {
                  const Icon = levelIcon[l.level] || Info;
                  const color = levelColor[l.level] || 'text-slate-400';
                  return (
                    <tr key={l.id} className="border-b border-surface-border/30 hover:bg-surface-muted transition-colors">
                      <td className="px-4 py-2 text-slate-600">{l.created_at?.slice(11, 19)}</td>
                      <td className="px-4 py-2">
                        <span className={`flex items-center gap-1 ${color}`}>
                          <Icon size={11} /> {l.level}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-500">{l.category}</td>
                      <td className="px-4 py-2 text-slate-300">{l.message}
                        {l.detail && <span className="text-slate-600 ml-1">· {l.detail}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* File Log */}
      {tab === 'file' && (
        <>
          <div className="flex items-center gap-3">
            <select value={fileType} onChange={(e) => setFileType(e.target.value)}
              className="bg-surface-muted border border-surface-border rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none">
              <option value="record">record.log</option>
              <option value="error">error.log</option>
            </select>
            <button onClick={refresh} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          <div className="bg-surface-card border border-surface-border rounded-lg p-4 font-mono text-[11px] text-slate-400 overflow-y-auto max-h-[60vh] space-y-0.5">
            {fileLog.lines.length === 0 && <p className="text-slate-600">Log kosong</p>}
            {fileLog.lines.map((line, i) => (
              <p key={i} className={
                line.includes('[ERROR]') ? 'text-danger' :
                line.includes('[WARN]')  ? 'text-warning' :
                'text-slate-400'
              }>{line}</p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
