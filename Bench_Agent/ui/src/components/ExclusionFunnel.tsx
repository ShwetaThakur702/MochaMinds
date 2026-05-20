import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import { ExclusionAudit } from '../types'

interface Props {
  audit: ExclusionAudit
}

const LABELS: Record<string, string> = {
  excluded_exit:         'Exit Confirmed',
  excluded_bz:           'BZ Resource',
  excluded_d_rated:      'D-Rated',
  excluded_on_leave:     'On Leave',
  excluded_resignation:  'Resignation',
  excluded_cao_new:      'CAO Active (New)',
  excluded_campus_no_fbd:'Campus No FBD',
}

const COLORS: Record<string, string> = {
  excluded_exit:          '#ef4444',
  excluded_bz:            '#f97316',
  excluded_d_rated:       '#eab308',
  excluded_on_leave:      '#8b5cf6',
  excluded_resignation:   '#ec4899',
  excluded_cao_new:       '#06b6d4',
  excluded_campus_no_fbd: '#64748b',
}

export default function ExclusionFunnel({ audit }: Props) {
  const bars = Object.entries(LABELS).map(([key, label]) => ({
    label,
    count: audit[key as keyof ExclusionAudit] as number,
    key,
  })).sort((a, b) => b.count - a.count)

  return (
    <div className="excl-funnel">
      <div className="excl-funnel-header">
        <span className="excl-funnel-title">Exclusion Breakdown</span>
        <span className="excl-funnel-sub">
          {audit.total_input_rows.toLocaleString()} total → <strong>{audit.deployable_bench_count}</strong> deployable
          &nbsp;({audit.total_excluded} excluded, conditions overlap)
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 32, left: 140, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={140} />
          <Tooltip
            formatter={(val: number) => [val.toLocaleString(), 'Excluded']}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="count" radius={[0, 3, 3, 0]}>
            {bars.map(b => (
              <Cell key={b.key} fill={COLORS[b.key] ?? '#94a3b8'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
