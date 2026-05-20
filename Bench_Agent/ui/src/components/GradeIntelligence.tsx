import { SnapshotData } from '../types'

interface Props {
  snapshot: SnapshotData
}

interface GradeRow {
  grade: string
  bench: number
  demand: number
}

export default function GradeIntelligence({ snapshot }: Props) {
  const gradeSupply = snapshot.grade_supply ?? {}
  const gradeDemand = snapshot.grade_demand ?? {}
  const allGrades = Array.from(new Set([...Object.keys(gradeSupply), ...Object.keys(gradeDemand)]))

  const rows: GradeRow[] = allGrades.map(g => ({
    grade: g,
    bench: gradeSupply[g] ?? 0,
    demand: gradeDemand[g] ?? 0,
  }))

  // Mismatch: zero bench but demand > 10
  const mismatch = rows
    .filter(r => r.bench === 0 && r.demand > 10)
    .sort((a, b) => b.demand - a.demand)

  // Stranded: bench > 0 but zero demand
  const stranded = rows
    .filter(r => r.bench > 0 && r.demand === 0)
    .sort((a, b) => b.bench - a.bench)

  // Full grid (all grades) sorted by demand desc
  const allSorted = [...rows].sort((a, b) => b.demand - a.demand)

  return (
    <section>
      <h2 className="section-title">
        <span className="section-title-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="1" width="14" height="14" rx="2" />
            <line x1="1" y1="6" x2="15" y2="6" /><line x1="6" y1="6" x2="6" y2="15" />
          </svg>
        </span>
        Grade Intelligence
      </h2>

      {/* Grade Mismatch */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="si-banner si-banner-critical">
          {mismatch.length} grade{mismatch.length !== 1 ? 's' : ''} with zero bench supply but significant open demand
        </div>
        <div className="card-label" style={{ marginBottom: 12 }}>Grade Mismatch — High Demand, No Supply</div>
        {mismatch.length === 0 ? (
          <p className="gi-empty">No grade mismatches detected.</p>
        ) : (
          <table className="gi-table">
            <thead>
              <tr>
                <th>Grade</th>
                <th>Bench Supply</th>
                <th>Open Demand</th>
                <th>Gap</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {mismatch.map(r => (
                <tr key={r.grade} className="gi-row-critical">
                  <td><span className="gi-badge gi-badge-critical">{r.grade}</span></td>
                  <td className="gi-num">0</td>
                  <td className="gi-num gi-red">{r.demand}</td>
                  <td className="gi-num gi-red">−{r.demand}</td>
                  <td className="gi-action">Consider lateral hiring or cross-grade deployment</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Stranded headcount */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="si-banner si-banner-warning">
          {stranded.length} grade{stranded.length !== 1 ? 's' : ''} have bench supply but zero open demand
        </div>
        <div className="card-label" style={{ marginBottom: 12 }}>Stranded Headcount — Supply Without Demand</div>
        {stranded.length === 0 ? (
          <p className="gi-empty">No stranded grades detected.</p>
        ) : (
          <table className="gi-table">
            <thead>
              <tr>
                <th>Grade</th>
                <th>Bench Supply</th>
                <th>Open Demand</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {stranded.map(r => (
                <tr key={r.grade} className="gi-row-warning">
                  <td><span className="gi-badge gi-badge-warning">{r.grade}</span></td>
                  <td className="gi-num gi-amber">{r.bench}</td>
                  <td className="gi-num">0</td>
                  <td className="gi-action">Consider reskilling or redeployment to adjacent grades</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Full grade matrix */}
      <div className="card">
        <div className="card-label" style={{ marginBottom: 12 }}>Full Grade Coverage Matrix</div>
        <div className="gi-scroll">
          <table className="gi-table">
            <thead>
              <tr>
                <th>Grade</th>
                <th>Bench</th>
                <th>Demand</th>
                <th>Coverage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {allSorted.map(r => {
                const ratio = r.demand > 0 ? r.bench / r.demand : (r.bench > 0 ? Infinity : 0)
                const statusLabel =
                  ratio === Infinity ? 'No Demand' :
                  ratio === 0 && r.demand > 0 ? 'CRITICAL' :
                  ratio < 0.2 ? 'CRITICAL' :
                  ratio < 0.5 ? 'SHORTAGE' :
                  ratio < 1.0 ? 'ADEQUATE' : 'SURPLUS'
                const statusClass =
                  statusLabel === 'CRITICAL' ? 'gi-status-critical' :
                  statusLabel === 'SHORTAGE' ? 'gi-status-shortage' :
                  statusLabel === 'SURPLUS'  ? 'gi-status-surplus' :
                  statusLabel === 'No Demand' ? 'gi-status-warning' :
                  'gi-status-adequate'
                const pct = r.demand > 0 ? Math.min(100, Math.round(r.bench / r.demand * 100)) : (r.bench > 0 ? 100 : 0)

                return (
                  <tr key={r.grade}>
                    <td><strong>{r.grade}</strong></td>
                    <td className="gi-num">{r.bench}</td>
                    <td className="gi-num">{r.demand}</td>
                    <td>
                      <div className="gi-bar-track">
                        <div
                          className="gi-bar-fill"
                          style={{
                            width: `${pct}%`,
                            background: statusLabel === 'CRITICAL' ? '#ef4444' :
                              statusLabel === 'SHORTAGE' ? '#f97316' :
                              statusLabel === 'SURPLUS'  ? '#4361EE' :
                              statusLabel === 'No Demand' ? '#f59e0b' : '#22c55e',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{pct}%</span>
                    </td>
                    <td><span className={`gi-status-badge ${statusClass}`}>{statusLabel}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
