'use client';

import { usePathname } from 'next/navigation';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';

const titles = {
  '/':           'Dashboard',
  '/recording':  'Recording',
  '/cameras':    'Camera Status',
  '/import':     'Import Excel',
  '/search':     'Search Resi',
  '/export':     'Export Video',
  '/config':     'Configuration',
  '/storage':    'Storage Management',
  '/logs':       'Activity Log',
};

export default function Header() {
  const pathname = usePathname();
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('id-ID'));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-12 bg-surface-card border-b border-surface-border flex items-center justify-between px-6 shrink-0">
      <h1 className="text-sm font-semibold text-slate-200">{titles[pathname] || 'CCTV System'}</h1>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Clock size={12} />
        <span>{time}</span>
      </div>
    </header>
  );
}
