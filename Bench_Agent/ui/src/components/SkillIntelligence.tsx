import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import { SnapshotData, DeploymentMatch } from '../types'

interface Props {
  snapshot: SnapshotData
  deploymentMatches: DeploymentMatch[]
}

const RATING_COLORS: Record<string, string> = {
  '1': '#ef4444',
  '2': '#f97316',
  '3': '#22c55e',
  '4': '#4361EE',
}

const RATING_LABELS: Record<string, string> = {
  '1': 'Beginner (1)',
  '2': 'Developing (2)',
  '3': 'Proficient (3)',
  '4': 'Expert (4)',
}

export default function SkillIntelligence({ snapshot, deploymentMatches }: Props) {
  // Chart 1 — Zero bench coverage skills (bench=0, demand>0)
  const zeroSupply = deploymentMatches
    .filter(d => d.bench_count === 0 && d.open_demand_count > 0)
    .sort((a, b) => b.open_demand_count - a.open_demand_count)
    .slice(0, 15)

  // Chart 2 — Skill proficiency distribution
  const ratingDist = Object.entries(snapshot.skill_rating_distribution ?? {})
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([rating, count]) => ({ rating, label: RATING_LABELS[rating] ?? `Rating ${rating}`, count }))

  const beginnerCount = snapshot.skill_rating_distribution?.['1'] ?? 0

  // Chart 3 — Skill staleness top 10
  const stalenessData = Object.entries(snapshot.skill_staleness ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }))

  return (
    <section>
      <h2 className="section-title">
        <span className="section-title-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6.5" /><line x1="8" y1="5" x2="8" y2="8.5" />
            <circle cx="8" cy="11" r=".6" fill="currentColor" stroke="none" />
          </svg>
        </span>
        Skill Intelligence
      </h2>

      {/* Chart 1 — Zero coverage */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="si-banner si-banner-critical">
          CRITICAL: Active demand, no bench supply — {zeroSupply.length} skills with zero coverage
        </div>
        <div className="card-label" style={{ marginBottom: 8 }}>Skills with Zero Bench Coverage</div>
        {zeroSupply.length === 0 ? (
          <p className="si-empty">No zero-coverage skills found.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(200, zeroSupply.length * 28)}>
            <BarChart data={zeroSupply} layout="vertical" margin={{ top: 4, right: 40, left: 120, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="skill" tick={{ fontSize: 12 }} width={120} />
              <Tooltip
                formatter={(val: number) => [val, 'Open Demand']}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="open_demand_count" name="Open Demand" radius={[0, 3, 3, 0]} fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart 2 — Proficiency distribution */}
      <div className="card" style={{ marginBottom: 16 }}>
        {beginnerCount > 20 && (
          <div className="si-banner si-banner-warning">
            {beginnerCount} beginner-rated employees (Rating 1) — deployment risk without mentoring
          </div>
        )}
        <div className="card-label" style={{ marginBottom: 8 }}>Skill Proficiency Distribution</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={ratingDist} margin={{ top: 4, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(val: number) => [val, 'Employees']}
              contentStyle={{ fontSize: 12 }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {ratingDist.map(d => (
                <Cell key={d.rating} fill={RATING_COLORS[d.rating] ?? '#94a3b8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 3 — Staleness */}
      <div className="card">
        <div className="si-banner si-banner-warning">
          Warning: High proportion of skill records last used before {new Date().getFullYear() - 2} — verify before deploying
        </div>
        <div className="card-label" style={{ marginBottom: 8 }}>Top Skills by Stale Record Count</div>
        {stalenessData.length === 0 ? (
          <p className="si-empty">No staleness data available.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, stalenessData.length * 28)}>
            <BarChart data={stalenessData} layout="vertical" margin={{ top: 4, right: 40, left: 120, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="skill" tick={{ fontSize: 12 }} width={120} />
              <Tooltip
                formatter={(val: number) => [val, 'Stale Records']}
                contentStyle={{ fontSize: 12 }}
              />
              <Bar dataKey="count" name="Stale Records" radius={[0, 3, 3, 0]} fill="#f97316" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  )
}
