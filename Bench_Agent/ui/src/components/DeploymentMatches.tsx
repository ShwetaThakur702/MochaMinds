import { DeploymentMatch, CoverageLabel } from '../types'
import { downloadCSV, printToPDF, todayStr } from '../utils/download'

interface Props {
  data: DeploymentMatch[]
}

const LABEL_META: Record<CoverageLabel, { text: string; className: string }> = {
  FULL:    { text: 'Full',    className: 'badge-full' },
  PARTIAL: { text: 'Partial', className: 'badge-partial' },
  NONE:    { text: 'None',    className: 'badge-none' },
}

function CoverageBadge({ label }: { label: CoverageLabel }) {
  const meta = LABEL_META[label]
  return <span className={`coverage-badge ${meta.className}`}>{meta.text}</span>
}

function CoverageBar({ pct }: { pct: number }) {
  const cls = pct >= 100 ? 'bar-full' : pct > 0 ? 'bar-partial' : 'bar-none'
  return (
    <div className="coverage-bar-track" title={`${pct}%`}>
      <div className={`coverage-bar-fill ${cls}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      <span className="coverage-bar-label">{pct}%</span>
    </div>
  )
}

export default function DeploymentMatches({ data }: Props) {
  const full    = data.filter(d => d.coverage_label === 'FULL').length
  const partial = data.filter(d => d.coverage_label === 'PARTIAL').length
  const none    = data.filter(d => d.coverage_label === 'NONE').length

  return (
    <div className="deployment-matches">
      <div className="dm-dl-bar">
        <button className="dl-btn" onClick={() => downloadCSV(data as unknown as Record<string, unknown>[], `deployment_matches_${todayStr()}.csv`)}>⬇ CSV</button>
        <button className="dl-btn" onClick={() => printToPDF(`BenchAgent - Deployment Matches - ${todayStr()}`)}>⬇ PDF</button>
      </div>
      <div className="dm-summary-row">
        <div className="dm-stat dm-stat-full">
          <span className="dm-stat-value">{full}</span>
          <span className="dm-stat-label">Full Coverage</span>
        </div>
        <div className="dm-stat dm-stat-partial">
          <span className="dm-stat-value">{partial}</span>
          <span className="dm-stat-label">Partial</span>
        </div>
        <div className="dm-stat dm-stat-none">
          <span className="dm-stat-value">{none}</span>
          <span className="dm-stat-label">No Coverage</span>
        </div>
      </div>

      <div className="dm-table-wrap">
        <table className="dm-table">
          <thead>
            <tr>
              <th>Skill</th>
              <th className="num">Bench Supply</th>
              <th className="num">Open Demand</th>
              <th className="num">Matched</th>
              <th className="num">Gap</th>
              <th>Coverage</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className={row.coverage_label === 'NONE' ? 'row-none' : ''}>
                <td className="skill-cell">{row.skill}</td>
                <td className="num">{row.bench_count}</td>
                <td className="num">{row.open_demand_count}</td>
                <td className="num">{row.matched_count}</td>
                <td className={`num ${row.gap > 0 ? 'gap-positive' : ''}`}>
                  {row.gap > 0 ? `−${row.gap}` : '—'}
                </td>
                <td className="bar-cell">
                  <CoverageBar pct={row.coverage_pct} />
                </td>
                <td>
                  <CoverageBadge label={row.coverage_label} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
