export default function StatCard({ title, value, sub, icon: Icon, color = 'text-accent' }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg p-4 flex items-center gap-4">
      {Icon && (
        <div className={`p-2 rounded-lg bg-surface-muted ${color}`}>
          <Icon size={20} />
        </div>
      )}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
