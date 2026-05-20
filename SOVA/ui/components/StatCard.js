import clsx from 'clsx'

export default function StatCard({ label, value, sub, accent, delay = 0, large = false }) {
  const accentClasses = {
    green:  'text-green-400',
    red:    'text-red-400',
    amber:  'text-amber-400',
    blue:   'text-blue-400',
    white:  'text-white',
  }

  return (
    <div
      className="card p-5 flex flex-col h-full gap-3 animate-fade-up opacity-0"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'forwards' }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-dim)]">{label}</div>
      <div className={clsx(
        'font-display font-bold leading-none num-pop break-words',
        large ? 'text-4xl' : 'text-3xl',
        accentClasses[accent] || 'text-[var(--text-primary)]'
      )}>
        {value ?? '—'}
      </div>
      {sub && <div className="text-xs text-[var(--text-muted)] mt-auto">{sub}</div>}
    </div>
  )
}
