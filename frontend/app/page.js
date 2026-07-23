'use client';

import { useEffect, useState, useCallback } from 'react';
import { Camera, Wifi, WifiOff, HardDrive, Video, Download, FileText, RefreshCw } from 'lucide-react';
import StatCard from '../components/StatCard';

function fmt(bytes) {
  if (!bytes) return '0 B';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return gb.toFixed(2) + ' GB';
  const mb = bytes / 1024 ** 2;
  if (mb >= 1) return mb.toFixed(1) + ' MB';
  return (bytes / 1024).toFixed(0) + ' KB';
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard');
      const d = await r.json();
      setData(d);
      setLastUpdate(new Date().toLocaleTimeString('id-ID'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData]);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-500 text-sm">Loading...</div>
  );

  const storageUsedPct = data?.storage?.total
    ? Math.round((data.storage.used / data.storage.total) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Auto-refresh info */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Auto-refresh every 15 seconds</p>
        <button onClick={fetchData} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors">
          <RefreshCw size={12} /> Refresh {lastUpdate && `· ${lastUpdate}`}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Kamera Online"  value={data?.cameras?.online ?? 0}  icon={Wifi}    color="text-success" />
        <StatCard title="Kamera Offline" value={data?.cameras?.offline ?? 0} icon={WifiOff} color="text-danger"  />
        <StatCard title="Recording Hari Ini" value={data?.recordings?.today ?? 0} icon={Video} />
        <StatCard title="Export Hari Ini" value={data?.exports?.today ?? 0} icon={Download} color="text-warning" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Scan Hari Ini" value={data?.scans?.today ?? 0}  icon={FileText} />
        <StatCard title="Total Scan"    value={data?.scans?.total ?? 0}  icon={FileText} color="text-slate-400" />
        <StatCard title="File Recording" value={data?.storage?.files ?? 0} icon={HardDrive} color="text-slate-400" />
      </div>

      {/* Storage Bar */}
      <div className="bg-surface-card border border-surface-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-slate-300">Storage Usage</p>
          <p className="text-xs text-slate-500">
            {fmt(data?.storage?.used)} / {fmt(data?.storage?.total)}
          </p>
        </div>
        <div className="w-full bg-surface-muted rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              storageUsedPct > 85 ? 'bg-danger' : storageUsedPct > 60 ? 'bg-warning' : 'bg-accent'
            }`}
            style={{ width: `${Math.min(storageUsedPct, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <p className="text-[10px] text-slate-600">{storageUsedPct}% digunakan</p>
          <p className="text-[10px] text-slate-600">{fmt(data?.storage?.free)} tersisa</p>
        </div>
      </div>

      {/* Camera Quick Status */}
      <CameraQuickStatus />
    </div>
  );
}

function CameraQuickStatus() {
  const [cameras, setCameras] = useState([]);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const r = await fetch('/api/cameras');
        setCameras(await r.json());
      } catch (_) {}
    };
    fetch_();
    const id = setInterval(fetch_, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-5">
      <p className="text-sm font-medium text-slate-300 mb-4">Status Kamera</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cameras.map((cam) => (
          <div key={cam.id} className="bg-surface-muted rounded-lg p-3 border border-surface-border">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-slate-300">{cam.name}</span>
              <span className={`text-[10px] font-bold ${cam.status === 'ONLINE' ? 'text-success' : 'text-danger'}`}>
                {cam.status}
              </span>
            </div>
            <p className="text-[10px] text-slate-600">{cam.ip}</p>
            {cam.recordingPid && (
              <p className="text-[10px] text-slate-600 mt-0.5">PID {cam.recordingPid}</p>
            )}
          </div>
        ))}
        {cameras.length === 0 && (
          <p className="text-xs text-slate-600 col-span-4">Belum ada data kamera.</p>
        )}
      </div>
    </div>
  );
}
