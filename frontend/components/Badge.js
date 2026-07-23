export default function Badge({ status }) {
  const map = {
    ONLINE:   'bg-success/10 text-success border-success/30',
    OFFLINE:  'bg-danger/10 text-danger border-danger/30',
    exported: 'bg-accent/10 text-accent border-accent/30',
    pending:  'bg-slate-500/10 text-slate-400 border-slate-500/30',
    error:    'bg-danger/10 text-danger border-danger/30'
  };
  const cls = map[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/30';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${cls}`}>
      {status}
    </span>
  );
}
