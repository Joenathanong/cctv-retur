'use client';

import { useState } from 'react';
import { Search, Video, CheckCircle, AlertCircle, Download, List, ArrowLeft } from 'lucide-react';

export default function SearchPage() {
  const [query, setQuery]       = useState('');
  const [result, setResult]     = useState(null);   // single result
  const [multiList, setMultiList] = useState(null); // { results, total }
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(null);

  const doSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    setMultiList(null);
    setError(null);
    setExported(null);

    try {
      const r = await fetch(`/api/search?resi=${encodeURIComponent(query.trim().toUpperCase())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);

      if (d.multiple) {
        setMultiList(d);
      } else {
        setResult(d);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  // Load full detail for a resi from the list
  const selectResi = async (resi) => {
    setLoading(true);
    setError(null);
    setExported(null);
    try {
      const r = await fetch(`/api/search?resi=${encodeURIComponent(resi.toUpperCase())}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (d.multiple) {
        // exact match not found; just pick first from list
        setResult(d.results[0]);
      } else {
        setResult(d);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const doExport = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const r = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resi: result.resi })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setExported(d);
    } catch (e) {
      setError(e.message);
    }
    setExporting(false);
  };

  const goBack = () => { setResult(null); };

  return (
    <div className="max-w-2xl space-y-5">
      {/* Search bar */}
      <form onSubmit={doSearch} className="flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Masukkan nomor resi (bisa sebagian)"
          className="flex-1 bg-surface-muted border border-surface-border rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="flex items-center gap-2 px-5 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <Search size={15} /> Cari
        </button>
      </form>

      {loading && <p className="text-sm text-slate-500">Mencari...</p>}

      {error && (
        <div className="bg-danger/5 border border-danger/20 rounded-lg p-4 flex items-center gap-2">
          <AlertCircle size={16} className="text-danger flex-shrink-0" />
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* ── Multiple results list ── */}
      {!result && multiList && (
        <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-surface-border bg-surface-muted">
            <List size={14} className="text-accent" />
            <p className="text-xs text-slate-400">
              Ditemukan <span className="text-slate-200 font-semibold">{multiList.total}</span> resi — klik untuk lihat detail
            </p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-border text-slate-500 uppercase tracking-wide text-[10px]">
                <th className="text-left px-4 py-3">Resi</th>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Tanggal</th>
                <th className="text-left px-4 py-3">Waktu</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {multiList.results.map((row) => (
                <tr
                  key={row.resi}
                  onClick={() => selectResi(row.resi)}
                  className="border-b border-surface-border/50 hover:bg-surface-muted cursor-pointer transition-colors"
                >
                  <td className="px-4 py-2.5 text-slate-200 font-medium">{row.resi}</td>
                  <td className="px-4 py-2.5 text-slate-400">{row.user}</td>
                  <td className="px-4 py-2.5 text-slate-500">{row.scan_date}</td>
                  <td className="px-4 py-2.5 text-slate-400">{row.start_time}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold
                      ${row.exported === 1
                        ? 'bg-success/10 text-success'
                        : 'bg-slate-700 text-slate-400'}`}>
                      {row.exported === 1 ? 'exported' : row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Single result detail ── */}
      {result && (
        <div className="bg-surface-card border border-surface-border rounded-lg p-5 space-y-4">
          {/* Back button (only if came from list) */}
          {multiList && (
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors -mt-1"
            >
              <ArrowLeft size={12} /> Kembali ke daftar
            </button>
          )}

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Video size={18} className="text-accent" />
              <p className="font-semibold text-white text-lg">{result.resi}</p>
            </div>
            <span className={`text-xs font-bold px-2 py-1 rounded border
              ${result.hasVideo
                ? 'bg-success/10 text-success border-success/30'
                : 'bg-warning/10 text-warning border-warning/30'}`}>
              {result.hasVideo ? 'Video Tersedia' : 'Video Tidak Ditemukan'}
            </span>
          </div>

          {/* Details */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <Field label="User"       value={result.user} />
            <Field label="Camera"     value={result.camera} />
            <Field label="Tanggal"    value={result.scan_date} />
            <Field label="Status"     value={result.status} />
            <Field label="Start Time" value={result.start_time} />
            <Field label="End Time"   value={result.end_time || result.endTime || '—'} />
          </div>

          {/* Actions */}
          {result.hasVideo && (
            <div className="flex gap-3 pt-2 border-t border-surface-border">
              <button
                onClick={doExport}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                <Download size={14} />
                {exporting ? 'Mengekspor...' : 'Export Video'}
              </button>
              {result.exported === 1 && result.export_path && (
                <a
                  href={`/api/export/download/${result.resi}`}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-muted text-slate-300 border border-surface-border rounded-lg text-sm hover:text-white transition-colors"
                >
                  <Download size={14} /> Download
                </a>
              )}
            </div>
          )}

          {exported && (
            <div className="bg-success/5 border border-success/20 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle size={15} className="text-success" />
              <div className="text-xs">
                <p className="text-success font-medium">Export berhasil!</p>
                <p className="text-slate-500 mt-0.5">{exported.path}</p>
                <a
                  href={`/api/export/download/${result.resi}`}
                  className="text-accent hover:underline mt-1 inline-block"
                >
                  Download {exported.file}
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="text-slate-200">{value || '—'}</p>
    </div>
  );
}
