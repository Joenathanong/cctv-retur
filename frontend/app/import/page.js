'use client';

import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Loader } from 'lucide-react';

export default function ImportPage() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scans, setScans] = useState({ total: 0, data: [] });
  const [scanFilters, setScanFilters] = useState({ date: '', user: '' });
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const doImport = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setError(null);

    const fd = new FormData();
    fd.append('file', file);

    try {
      const r = await fetch('/api/excel/import', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult(d);
      loadScans();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const loadScans = async () => {
    const p = new URLSearchParams({ limit: 200, ...Object.fromEntries(Object.entries(scanFilters).filter(([, v]) => v)) });
    try {
      const r = await fetch(`/api/excel/scans?${p}`);
      setScans(await r.json());
    } catch (_) {}
  };

  useState(() => { loadScans(); }, []);

  return (
    <div className="space-y-5">
      {/* Upload zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-surface-border hover:border-accent/50 rounded-xl p-10 text-center cursor-pointer transition-colors bg-surface-card"
      >
        <input
          ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => setFile(e.target.files[0])}
        />
        <FileSpreadsheet size={36} className="text-slate-600 mx-auto mb-3" />
        {file ? (
          <p className="text-sm text-accent font-medium">{file.name}</p>
        ) : (
          <>
            <p className="text-sm text-slate-400">Drag & drop file Excel di sini, atau klik untuk pilih</p>
            <p className="text-xs text-slate-600 mt-1">Mendukung .xlsx dan .xls</p>
          </>
        )}
      </div>

      <button
        onClick={doImport}
        disabled={!file || loading}
        className="flex items-center gap-2 px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
      >
        {loading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
        {loading ? 'Mengimpor...' : 'Import Excel'}
      </button>

      {/* Result */}
      {result && (
        <div className="bg-success/5 border border-success/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle size={16} className="text-success" />
            <p className="text-sm text-success font-medium">Import berhasil: {result.file}</p>
          </div>
          <div className="grid grid-cols-4 gap-3 text-xs text-slate-400">
            <div><span className="text-success font-semibold text-lg">{result.inserted}</span><br />Inserted</div>
            <div><span className="text-accent font-semibold text-lg">{result.updated ?? 0}</span><br />Updated</div>
            <div><span className="text-warning font-semibold text-lg">{result.skipped}</span><br />Skipped</div>
            <div><span className="text-danger font-semibold text-lg">{result.errors?.length || 0}</span><br />Errors</div>
          </div>
          {result.errors?.length > 0 && (
            <details className="mt-2">
              <summary className="text-xs text-danger cursor-pointer">Lihat error</summary>
              <ul className="mt-1 text-xs text-slate-500 space-y-0.5">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {error && (
        <div className="bg-danger/5 border border-danger/20 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle size={16} className="text-danger" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* Scan log table */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <p className="text-sm font-medium text-slate-300">Data Scan</p>
          <input type="date" value={scanFilters.date}
            onChange={(e) => setScanFilters((f) => ({ ...f, date: e.target.value }))}
            className="bg-surface-muted border border-surface-border rounded px-2 py-1 text-xs text-slate-300 focus:outline-none" />
          <input type="text" placeholder="User" value={scanFilters.user}
            onChange={(e) => setScanFilters((f) => ({ ...f, user: e.target.value }))}
            className="bg-surface-muted border border-surface-border rounded px-2 py-1 text-xs text-slate-300 focus:outline-none w-28" />
          <button onClick={loadScans} className="text-xs text-accent hover:text-accent-hover">Cari</button>
          <span className="text-xs text-slate-600 ml-auto">{scans.total} record</span>
        </div>

        <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-border bg-surface-muted text-slate-500 uppercase tracking-wide text-[10px]">
                <th className="text-left px-4 py-2.5">Resi</th>
                <th className="text-left px-4 py-2.5">User</th>
                <th className="text-left px-4 py-2.5">Camera</th>
                <th className="text-left px-4 py-2.5">Date</th>
                <th className="text-left px-4 py-2.5">Start</th>
                <th className="text-left px-4 py-2.5">End</th>
                <th className="text-left px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {scans.data.length === 0 && (
                <tr><td colSpan={7} className="text-center py-6 text-slate-600">Belum ada data scan</td></tr>
              )}
              {scans.data.map((s) => (
                <tr key={s.id} className="border-b border-surface-border/50 hover:bg-surface-muted transition-colors">
                  <td className="px-4 py-2 text-slate-200 font-medium">{s.resi}</td>
                  <td className="px-4 py-2 text-slate-400">{s.user}</td>
                  <td className="px-4 py-2 text-accent">{s.camera}</td>
                  <td className="px-4 py-2 text-slate-500">{s.scan_date}</td>
                  <td className="px-4 py-2 text-slate-400">{s.start_time}</td>
                  <td className="px-4 py-2 text-slate-400">{s.end_time || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border
                      ${s.status === 'exported' ? 'bg-accent/10 text-accent border-accent/30' : 'bg-slate-500/10 text-slate-400 border-slate-600'}`}>
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
