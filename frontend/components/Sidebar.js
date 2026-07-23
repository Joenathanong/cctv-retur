'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Video, Camera, FileSpreadsheet,
  Search, Download, Settings, HardDrive, ScrollText, Cctv
} from 'lucide-react';

const nav = [
  { label: 'Dashboard',      href: '/',          icon: LayoutDashboard },
  { label: 'Recording',      href: '/recording',  icon: Video },
  { label: 'Camera Status',  href: '/cameras',    icon: Camera },
  { label: 'Import Excel',   href: '/import',     icon: FileSpreadsheet },
  { label: 'Search Resi',    href: '/search',     icon: Search },
  { label: 'Export Video',   href: '/export',     icon: Download },
  { label: 'Configuration',  href: '/config',     icon: Settings },
  { label: 'Storage',        href: '/storage',    icon: HardDrive },
  { label: 'Log',            href: '/logs',       icon: ScrollText },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-surface-card border-r border-surface-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-4 border-b border-surface-border flex items-center gap-2">
        <Cctv className="text-accent" size={22} />
        <div>
          <p className="text-sm font-bold text-white leading-none">CCTV Retur</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Warehouse System</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                ${active
                  ? 'bg-accent/10 text-accent border-r-2 border-accent font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-surface-muted'
                }`}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-surface-border">
        <p className="text-[10px] text-slate-600 text-center">v1.0.0 · EJI Warehouse</p>
      </div>
    </aside>
  );
}
