import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'

const COLORS = {
  R1: '#f87171',
  R2: '#fbbf24',
  R3: '#fb923c',
  R4: '#a78bfa',
  R5: '#4ade80',
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--bg-card-hover)] border border-[var(--border-bright)] rounded-xl p-3 shadow-xl">
      <div className="text-xs font-semibold uppercase text-[var(--text-dim)] mb-1">{label}</div>
      <div className="text-lg font-display font-bold text-[var(--text-primary)]">{payload[0].value}</div>
      <div className="text-xs text-[var(--text-muted)]">exceptions</div>
    </div>
  )
}

export default function RuleChart({ summary }) {
  if (!summary) return null

  const data = [
    { rule: 'R1 · Billing',   count: summary.r1_count, id: 'R1' },
    { rule: 'R2 · Geo',       count: summary.r2_count, id: 'R2' },
    { rule: 'R3 · Cluster',   count: summary.r3_count, id: 'R3' },
    { rule: 'R4 · Currency',  count: summary.r4_count, id: 'R4' },
    { rule: 'R5 · JD',        count: summary.r5_count, id: 'R5' },
  ]

  return (
    <div className="card p-6 animate-fade-up opacity-0 stagger-3" style={{ animationFillMode: 'forwards' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-dim)]">Rule Breakdown</div>
          <div className="font-display font-semibold text-[var(--text-primary)] mt-0.5">Exceptions by Rule</div>
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-dim)]">This Run</div>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} barSize={64} margin={{ top: 40, right: 0, left: -20, bottom: 0 }}>
          <XAxis
            dataKey="rule"
            tick={{ fill: 'var(--text-dim)', fontSize: 11, fontFamily: 'DM Sans', fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--text-dim)', fontSize: 11, fontFamily: 'DM Sans' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(35,150,96,0.06)' }} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            <LabelList dataKey="count" position="top" fill="var(--text-primary)" fontSize={24} fontWeight="bold" fontFamily="Outfit, DM Sans, sans-serif" offset={10} />
            {data.map((d) => (
              <Cell key={d.id} fill={COLORS[d.id]} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
