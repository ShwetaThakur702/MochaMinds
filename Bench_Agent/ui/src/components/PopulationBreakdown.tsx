import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { ExclusionAudit } from '../types'

interface Props {
  audit: ExclusionAudit
}

const SEGMENTS = [
  { key: 'deployable_bench_count', label: 'Deployable Bench', color: '#22c55e' },
  { key: 'excluded_exit',          label: 'Exit Confirmed',   color: '#ef4444' },
  { key: 'excluded_bz',            label: 'BZ Resource',      color: '#f97316' },
  { key: 'excluded_d_rated',       label: 'D-Rated',          color: '#eab308' },
  { key: 'excluded_on_leave',      label: 'On Leave',         color: '#8b5cf6' },
  { key: 'excluded_resignation',   label: 'Resignation',      color: '#ec4899' },
  { key: 'excluded_cao_new',       label: 'CAO Active',       color: '#06b6d4' },
  { key: 'excluded_campus_no_fbd', label: 'Campus No FBD',    color: '#64748b' },
]

export default function PopulationBreakdown({ audit }: Props) {
  // Single-row stacked bar — each segment is one Bar
  const row: Record<string, number | string> = { name: 'Population' }
  SEGMENTS.forEach(s => {
    row[s.label] = audit[s.key as keyof ExclusionAudit] as number
  })

  const pct = (val: number) =>
    `${val} (${((val / audit.total_input_rows) * 100).toFixed(1)}%)`

  return (
    <div className="pop-breakdown">
      <div className="pop-breakdown-header">
        <span className="pop-breakdown-title">Full Population Breakdown</span>
        <span className="pop-breakdown-sub">
          {audit.total_input_rows.toLocaleString()} employees — conditions are not mutually exclusive
        </span>
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={[row]} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" hide />
          <Tooltip
            formatter={(val: number, name: string) => [pct(val), name]}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
          {SEGMENTS.map(s => (
            <Bar key={s.key} dataKey={s.label} stackId="pop" fill={s.color} radius={0}>
              <Cell fill={s.color} />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
