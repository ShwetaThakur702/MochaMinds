import {
  Area, AreaChart, Legend, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ForecastRow } from '../types'

interface Props { data: ForecastRow[] }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '10px 14px',
      boxShadow: 'var(--shadow-md)', fontSize: 12, minWidth: 155,
    }}>
      <div style={{ fontWeight: 700, marginBottom: 7, color: 'var(--text)', fontSize: 12 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', padding: '2px 0' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{p.name}:</span>
          <strong style={{ color: p.color, fontFamily: 'DM Mono, monospace' }}>{p.value}</strong>
        </div>
      ))}
    </div>
  )
}

const REF_COLORS: Record<number, string> = { 30: '#4361EE', 60: '#F59E0B', 90: '#EF4444' }

const IconCalendar = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <line x1="5" y1="1" x2="5" y2="5" /><line x1="11" y1="1" x2="11" y2="5" />
    <line x1="2" y1="8" x2="14" y2="8" />
  </svg>
)
const IconTrend = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <polyline points="1,12 5,7 9,9 15,3" />
    <polyline points="10,3 15,3 15,8" />
  </svg>
)

export default function Forecast({ data }: Props) {
  const refDates = [30, 60, 90].map((day) => ({
    day,
    date: data.find((r) => r.days_from_today === day)?.forecast_date ?? '',
  }))

  const tickFormatter = (v: string) => {
    const d = new Date(v)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const d30 = data.find((r) => r.days_from_today === 30)
  const d60 = data.find((r) => r.days_from_today === 60)
  const d90 = data.find((r) => r.days_from_today === 90)

  const stats = [
    { key: '30', label: '30-Day Bench',    val: d30?.confirmed_count ?? '—', icon: <IconCalendar /> },
    { key: '60', label: '60-Day Bench',    val: d60?.projected_count ?? '—', icon: <IconCalendar /> },
    { key: '90', label: '90-Day Bench',    val: d90?.projected_count ?? '—', icon: <IconCalendar /> },
    { key: 'delta', label: 'Total Projected', val: data.length > 0 ? data[data.length - 1].projected_count ?? '—' : '—', icon: <IconTrend /> },
  ]

  return (
    <section>
      <h2 className="section-title">
        <span className="section-title-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1,11 5,7 9,9 15,3" />
          </svg>
        </span>
        30 / 60 / 90-Day Forecast
      </h2>

      <div className="forecast-stats">
        {stats.map((s) => (
          <div key={s.key} className="forecast-stat">
            <div className="forecast-stat-icon">{s.icon}</div>
            <div>
              <div className="forecast-stat-val">{s.val}</div>
              <div className="forecast-stat-lbl">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Image 1-style smooth area chart */}
      <div className="card">
        <div className="card-label">Daily Bench Headcount — Confirmed vs Projected</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {refDates.map(({ day, date }) => date ? (
            <div key={day} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 999,
              background: 'var(--surface-2)', border: `1.5px dashed ${REF_COLORS[day]}`,
              fontSize: 12, fontWeight: 600, color: REF_COLORS[day],
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: REF_COLORS[day], display: 'inline-block' }} />
              Day {day} — {date}
            </div>
          ) : null)}
        </div>

        <div className="chart-box-tall">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 28, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="gradConfirmed" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--green)" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="var(--green)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradProjected" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#4361EE" stopOpacity={0.14} />
                  <stop offset="95%" stopColor="#4361EE" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="forecast_date"
                tick={{ fontSize: 10, fill: 'var(--text-4)' }}
                axisLine={{ stroke: 'var(--border-2)' }}
                tickLine={false} interval={14} tickFormatter={tickFormatter}
              />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-4)' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--text-3)', paddingTop: 12 }} />
              {refDates.map(({ day, date }) => date ? (
                <ReferenceLine key={day} x={date} stroke={REF_COLORS[day]}
                  strokeDasharray="5 4" strokeOpacity={0.6} strokeWidth={1.5}
                  label={{ value: `D${day}`, position: 'insideTopRight', fontSize: 9, fill: REF_COLORS[day], fontWeight: 700 }}
                />
              ) : null)}
              <Area
                type="monotone" dataKey="confirmed_count"
                name="Confirmed (High confidence)"
                stroke="var(--green)" strokeWidth={2.5}
                fill="url(#gradConfirmed)"
                dot={false} activeDot={{ r: 5, fill: 'var(--green)', stroke: 'var(--surface)', strokeWidth: 2 }}
              />
              <Area
                type="monotone" dataKey="projected_count"
                name="Projected (Mixed confidence)"
                stroke="#4361EE" strokeWidth={2}
                strokeDasharray="8 4"
                fill="url(#gradProjected)"
                dot={false} activeDot={{ r: 5, fill: '#4361EE', stroke: 'var(--surface)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  )
}