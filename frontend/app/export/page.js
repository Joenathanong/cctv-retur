'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, Trash2, X } from 'lucide-react';

export default function ExportPage() {
  const [data, setData]         = useState({ total: 0, data: [] });
  const [resiInput, setResiInput] = useState('');
  const [filter, setFilter]     = useState('');
  const [busy, setBusy]         = useState({});
  const [loading, setLoading]   = useState(false);

  // Delete All modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword]   = useState('');
  const [deleteError, setDeleteError]         = useState('');
  const [deleting, setDeleting]               = useState(false);
  const [deleteResult, setDeleteResult]       = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/export/list');
      setData(await r.json());
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const doExport = async (resi) => {
    setBusy((b) => ({ ...b, [resi]: true }));
    try {
      await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resi: resi.trim().toUpperCase() })
      });
      load();
    } catch (_) {}
    setBusy((b) => ({ ...b, [resi]: false }));
  };

  const handleManualExport = (e) => {
    e.preventDefault();
    if (resiInput.trim()) doExport(resiInput.trim());
  };

  const openDeleteModal = () => {
    setDeletePassword('');
    setDeleteError('');
    setDeleteResult(null);
    setShowDeleteModal(true);
  };

  const handleDeleteAll = async (e) => {
    e.preventDefault();
    setDeleteError('');
    setDeleting(true);
    try {
      const r = await fetch('/api/export/all', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword })
      });
      const d = await r.json();
      if (!r.ok) {
        setDeleteError(d.error || 'Gagal menghapus');
      } else {
        setDeleteResult(d);
        load();
      }
    } catch (err) {
      setDeleteError(err.message);
    }
    setDeleting(false);
  };

  // Filter displayed rows by resi/user/camera (case-insensitive)
  const displayed = filter.trim()
    ? data.data.filter((row) => {
        const q = filter.trim().toLowerCase();
        return (
          row.resi?.toLowerCase().includes(q) ||
          row.user?.toLowerCase().includes(q) ||
          row.camera?.toLowerCase().includes(q)
        );
      })
    : data.data;

  return (
    <div className="space-y-5">
      {/* Manual export */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-5">
        <p className="text-sm font-medium text-slate-300 mb-3">Export Manual</p>
        <form onSubmit={handleManualExport} className="flex gap-3">
          <input
            value={resiInput}
            onChange={(e) => setResiInput(e.target.value)}
            placeholder="Nomor resi"
            className="flex-1 bg-surface-muted border border-surface-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!resiInput.trim() || busy[resiInput.trim()]}
            className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <Download size={14} /> Export
          </button>
        </form>
      </div>

      {/* Export history */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-300">Riwayat Export</p>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{data.total} file</span>
            <button onClick={load} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
              <RefreshCw size={12} /> Refresh
            </button>
            {data.total > 0 && (
              <button
                onClick={openDeleteModal}
                className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                <Trash2 size={12} /> Delete All
              </button>
            )}
          </div>
        </div>

        {/* Filter input */}
        {data.data.length > 0 && (
          <div className="mb-3">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Cari resi, user, atau kamera..."
              className="w-full bg-surface-muted border border-surface-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent"
            />
          </div>
        )}

        <div className="bg-surface-card border border-surface-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-border bg-surface-muted text-slate-500 uppercase tracking-wide text-[10px]">
                <th className="text-left px-4 py-3">Resi</th>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Camera</th>
                <th className="text-left px-4 py-3">Tanggal</th>
                <th className="text-left px-4 py-3">Durasi</th>
                <th className="text-center px-4 py-3">Download</th>
                <th className="text-center px-4 py-3">Re-export</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center py-8 text-slate-600">Loading...</td></tr>
              )}
              {!loading && displayed.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-slate-600">
                    {filter.trim() ? 'Tidak ada hasil yang cocok' : 'Belum ada export'}
                  </td>
                </tr>
              )}
              {displayed.map((row) => {
                const dur = row.start_time && row.end_time
                  ? `${row.start_time} – ${row.end_time}`
                  : row.start_time || '—';
                return (
                  <tr key={row.resi} className="border-b border-surface-border/50 hover:bg-surface-muted transition-colors">
                    <td className="px-4 py-2.5 text-slate-200 font-medium">{row.resi}</td>
                    <td className="px-4 py-2.5 text-slate-400">{row.user}</td>
                    <td className="px-4 py-2.5 text-accent">{row.camera}</td>
                    <td className="px-4 py-2.5 text-slate-500">{row.scan_date}</td>
                    <td className="px-4 py-2.5 text-slate-400">{dur}</td>
                    <td className="px-4 py-2.5 text-center">
                      <a
                        href={`/api/export/download/${row.resi}`}
                        className="inline-flex items-center gap-1 text-accent hover:underline"
                      >
                        <Download size={12} /> Download
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => doExport(row.resi)}
                        disabled={!!busy[row.resi]}
                        className="text-slate-500 hover:text-slate-200 transition-colors disabled:opacity-40"
                      >
                        {busy[row.resi] ? '...' : 'Re-export'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Delete All Modal ─────────────────────────────────────────────── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-surface-card border border-surface-border rounded-xl p-6 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-white flex items-center gap-2">
                <Trash2 size={16} className="text-red-400" />
                Hapus Semua Export
              </p>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {!deleteResult ? (
              <>
                <p className="text-xs text-slate-400">
                  Semua file video export akan dihapus permanen dan status resi dikembalikan ke <span className="text-slate-200">pending</span>. Masukkan password untuk konfirmasi.
                </p>

                <form onSubmit={handleDeleteAll} className="space-y-3">
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Password"
                    autoFocus
                    className="w-full bg-surface-muted border border-surface-border rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-red-500"
                  />
                  {deleteError && (
                    <p className="text-xs text-red-400">{deleteError}</p>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setShowDeleteModal(false)}
                      className="flex-1 px-4 py-2 text-sm text-slate-400 border border-surface-border rounded-lg hover:text-white transition-colors"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      disabled={!deletePassword || deleting}
                      className="flex-1 px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Menghapus...' : 'Hapus Semua'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <p className="text-sm text-green-400">
                  Berhasil menghapus {deleteResult.files_deleted} file, reset {deleteResult.records_reset} record.
                </p>
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="w-full px-4 py-2 text-sm text-white bg-accent hover:bg-accent-hover rounded-lg transition-colors"
                >
                  Tutup
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
