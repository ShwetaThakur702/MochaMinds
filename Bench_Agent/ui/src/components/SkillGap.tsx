import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { DeploymentMatch } from '../types'

interface Props {
  data: DeploymentMatch[]
}

export default function SkillGap({ data }: Props) {
  const critical = data.filter(d => d.coverage_label === 'NONE' && d.open_demand_count > 0)
  const partial  = data.filter(d => d.coverage_label === 'PARTIAL')
  const covered  = data.filter(d => d.coverage_label === 'FULL')

  // Chart data — top 15 by gap for readability
  const chartData = [...data]
    .filter(d => d.open_demand_count > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 15)
    .map(d => ({
      skill: d.skill.length > 14 ? d.skill.slice(0, 13) + '…' : d.skill,
      fullSkill: d.skill,
      coverage_pct: d.coverage_pct,
      gap: d.gap,
      label: d.coverage_label,
    }))

  function barColor(label: string) {
    if (label === 'FULL')    return 'var(--color-success, #22c55e)'
    if (label === 'PARTIAL') return 'var(--color-warning, #f59e0b)'
    return 'var(--color-danger, #ef4444)'
  }

  return (
    <div className="skill-gap">
      <div className="sg-columns">
        <div className="sg-col sg-col-critical">
          <h3 className="sg-col-heading sg-heading-critical">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M8 2L1.5 13.5h13L8 2z" /><line x1="8" y1="7" x2="8" y2="10" /><circle cx="8" cy="12.5" r=".6" fill="currentColor" stroke="none" />
            </svg>
            Critical Gaps
            <span className="sg-count">{critical.length}</span>
          </h3>
          {critical.length === 0
            ? <p className="sg-empty">No critical gaps</p>
            : critical.map((d, i) => (
              <div key={i} className="sg-row">
                <span className="sg-skill">{d.skill}</span>
                <span className="sg-meta">demand {d.open_demand_count}, supply {d.bench_count}</span>
                <div className="sg-minibar-track">
                  <div className="sg-minibar-fill sg-fill-none" style={{ width: '0%' }} />
                </div>
              </div>
            ))}
        </div>

        <div className="sg-col sg-col-partial">
          <h3 className="sg-col-heading sg-heading-partial">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="8" cy="8" r="6" /><line x1="8" y1="5" x2="8" y2="8" /><circle cx="8" cy="11" r=".5" fill="currentColor" stroke="none" />
            </svg>
            Partial Coverage
            <span className="sg-count">{partial.length}</span>
          </h3>
          {partial.length === 0
            ? <p className="sg-empty">No partial matches</p>
            : partial.map((d, i) => (
              <div key={i} className="sg-row">
                <span className="sg-skill">{d.skill}</span>
                <span className="sg-meta">{d.coverage_pct}% covered, gap {d.gap}</span>
                <div className="sg-minibar-track">
                  <div className="sg-minibar-fill sg-fill-partial" style={{ width: `${d.coverage_pct}%` }} />
                </div>
              </div>
            ))}
        </div>

        <div className="sg-col sg-col-covered">
          <h3 className="sg-col-heading sg-heading-covered">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="8" cy="8" r="6" /><polyline points="5 8 7 10 11 6" />
            </svg>
            Fully Covered
            <span className="sg-count">{covered.length}</span>
          </h3>
          {covered.length === 0
            ? <p className="sg-empty">No fully covered skills</p>
            : covered.map((d, i) => (
              <div key={i} className="sg-row">
                <span className="sg-skill">{d.skill}</span>
                <span className="sg-meta">supply {d.bench_count} vs demand {d.open_demand_count}</span>
                <div className="sg-minibar-track">
                  <div className="sg-minibar-fill sg-fill-full" style={{ width: '100%' }} />
                </div>
              </div>
            ))}
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="sg-chart-section">
          <h3 className="sg-chart-title">Skill Coverage % (top {chartData.length} by demand)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
              <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="skill" width={110} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number, _name: string, props: { payload?: { fullSkill?: string; gap?: number } }) => [
                  `${value}% covered${(props.payload?.gap ?? 0) > 0 ? `, gap ${props.payload!.gap}` : ''}`,
                  props.payload?.fullSkill ?? '',
                ]}
              />
              <Bar dataKey="coverage_pct" radius={[0, 3, 3, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={barColor(entry.label)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
