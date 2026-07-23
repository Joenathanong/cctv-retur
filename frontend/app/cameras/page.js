'use client';

import { useEffect, useState } from 'react';
import { Play, Square, RefreshCw, Wifi, WifiOff } from 'lucide-react';

function fmt(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('id-ID');
}

export default function CamerasPage() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState({});

  const load = async () => {
    try {
      const r = await fetch('/api/cameras');
      setCameras(await r.json());
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  const action = async (camId, endpoint) => {
    setBusy((b) => ({ ...b, [camId]: true }));
    try {
      await fetch(`/api/cameras/${camId}/${endpoint}`, { method: 'POST' });
      await load();
    } catch (_) {}
    setBusy((b) => ({ ...b, [camId]: false }));
  };

  const actionAll = async (endpoint) => {
    setBusy((b) => ({ ...b, all: true }));
    try {
      await fetch(`/api/cameras/${endpoint}`, { method: 'POST' });
      setTimeout(load, 1000);
    } catch (_) {}
    setBusy((b) => ({ ...b, all: false }));
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-500 text-sm">Loading...</div>
  );

  return (
    <div className="space-y-4">
      {/* Bulk actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => actionAll('start-all')}
          disabled={busy.all}
          className="flex items-center gap-2 px-4 py-2 bg-success/10 text-success border border-success/30 rounded-lg text-sm hover:bg-success/20 transition-colors disabled:opacity-50"
        >
          <Play size={14} /> Start All
        </button>
        <button
          onClick={() => actionAll('stop-all')}
          disabled={busy.all}
          className="flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger border border-danger/30 rounded-lg text-sm hover:bg-danger/20 transition-colors disabled:opacity-50"
        >
          <Square size={14} /> Stop All
        </button>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 bg-surface-muted text-slate-400 border border-surface-border rounded-lg text-sm hover:text-white transition-colors ml-auto"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Camera cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {cameras.map((cam) => (
          <div key={cam.id} className="bg-surface-card border border-surface-border rounded-lg p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${cam.status === 'ONLINE' ? 'bg-success/10' : 'bg-danger/10'}`}>
                  {cam.status === 'ONLINE'
                    ? <Wifi size={18} className="text-success" />
                    : <WifiOff size={18} className="text-danger" />}
                </div>
                <div>
                  <p className="font-semibold text-white">{cam.name}</p>
                  <p className="text-xs text-slate-500">{cam.ip}:{cam.port}</p>
                </div>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded border
                ${cam.status === 'ONLINE'
                  ? 'bg-success/10 text-success border-success/30'
                  : 'bg-danger/10 text-danger border-danger/30'}`}
              >
                {cam.status}
              </span>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
              <div>
                <span className="text-slate-500">Recording PID</span>
                <p className="text-slate-300">{cam.recordingPid || '—'}</p>
              </div>
              <div>
                <span className="text-slate-500">Reconnects</span>
                <p className="text-slate-300">{cam.reconnectCount}</p>
              </div>
              <div className="col-span-2">
                <span className="text-slate-500">Last Seen</span>
                <p className="text-slate-300">{fmt(cam.lastSeen)}</p>
              </div>
              {cam.currentSegment && (
                <div className="col-span-2">
                  <span className="text-slate-500">Current Segment</span>
                  <p className="text-slate-300 truncate text-[10px]">{cam.currentSegment}</p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={() => action(cam.id, 'start')}
                disabled={busy[cam.id] || cam.status === 'ONLINE'}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-success/10 text-success border border-success/30 rounded-lg hover:bg-success/20 transition-colors disabled:opacity-40"
              >
                <Play size={12} /> Start
              </button>
              <button
                onClick={() => action(cam.id, 'stop')}
                disabled={busy[cam.id] || cam.status === 'OFFLINE'}
                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-danger/10 text-danger border border-danger/30 rounded-lg hover:bg-danger/20 transition-colors disabled:opacity-40"
              >
                <Square size={12} /> Stop
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
