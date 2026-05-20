import { useState } from 'react'
import { AlertRow, AlertSeverity } from '../types'
import { downloadCSV, printToPDF, todayStr } from '../utils/download'
import PsidTooltip from './PsidTooltip'

interface Props { data: AlertRow[] }

const ROW_CLASS: Record<AlertSeverity, string> = {
  CRITICAL: 'r-critical', HIGH: 'r-high', MEDIUM: 'r-medium', OK: 'r-ok',
}
const BADGE_CLASS: Record<AlertSeverity, string> = {
  CRITICAL: 'b-critical', HIGH: 'b-high', MEDIUM: 'b-medium', OK: 'b-ok',
}
const SEV_PILL_CLASS: Record<AlertSeverity, string> = {
  CRITICAL: 'sev-critical', HIGH: 'sev-high', MEDIUM: 'sev-medium', OK: 'sev-ok',
}
const DOT_CLASS: Record<AlertSeverity, string> = {
  CRITICAL: 'sev-dot sev-dot-critical',
  HIGH:     'sev-dot sev-dot-high',
  MEDIUM:   'sev-dot sev-dot-medium',
  OK:       'sev-dot sev-dot-ok',
}
const SEV_LABEL: Record<AlertSeverity, string> = {
  CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium', OK: 'OK',
}
const SEV_ORDER: AlertSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'OK']

export default function ThresholdAlerts({ data }: Props) {
  const [filterSev, setFilterSev] = useState<AlertSeverity | 'ALL'>('ALL')

  const breachedCount = data.filter((r) => r.is_breached).length
  const sevCounts = SEV_ORDER.reduce((acc, s) => {
    acc[s] = data.filter((r) => r.alert_severity === s).length
    return acc
  }, {} as Record<AlertSeverity, number>)

  const filtered = filterSev === 'ALL' ? data : data.filter((r) => r.alert_severity === filterSev)

  function toggleFilter(s: AlertSeverity) {
    setFilterSev(prev => prev === s ? 'ALL' : s)
  }

  return (
    <section>
      <h2 className="section-title">
        <span className="section-title-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2L1.5 13.5h13L8 2z" />
            <line x1="8" y1="7" x2="8" y2="10" />
            <circle cx="8" cy="12.5" r=".6" fill="currentColor" stroke="none" />
          </svg>
        </span>
        Threshold Alerts
        <span className="section-count">{data.length} org slices · {breachedCount} breached</span>
        <span className="section-dl-btns">
          <button className="dl-btn" onClick={() => downloadCSV(data as unknown as Record<string, unknown>[], `threshold_alerts_${todayStr()}.csv`)}>⬇ CSV</button>
          <button className="dl-btn" onClick={() => printToPDF(`BenchAgent - Threshold Alerts - ${todayStr()}`)}>⬇ PDF</button>
        </span>
      </h2>

      <div className="severity-bar">
        {SEV_ORDER.filter((s) => sevCounts[s] > 0).map((s) => (
          <div
            key={s}
            className={`severity-pill ${SEV_PILL_CLASS[s]}${filterSev === s ? ' sev-pill-active' : ''}`}
            onClick={() => toggleFilter(s)}
            title={filterSev === s ? 'Click to clear filter' : `Filter by ${SEV_LABEL[s]}`}
          >
            <span className={DOT_CLASS[s]} />
            {SEV_LABEL[s]}
            <span className="pill-count">{sevCounts[s]}</span>
          </div>
        ))}
        {filterSev !== 'ALL' && (
          <button className="filter-clear-btn" onClick={() => setFilterSev('ALL')}>✕ Clear</button>
        )}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-scroll" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Org Slice</th>
                <th className="num-center">Current Bench</th>
                <th className="num-center">Threshold</th>
                <th className="num-center">Breach Amount</th>
                <th>Severity</th>
                <th>Recommended Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.org_slice} className={ROW_CLASS[row.alert_severity]}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className={DOT_CLASS[row.alert_severity]} />
                      <strong style={{ color: 'var(--text)', fontSize: 13 }}>{row.org_slice}</strong>
                    </div>
                  </td>
                  <td className="num-center"><PsidTooltip count={row.current_bench_count} psids={row.bench_psids} /></td>
                  <td className="num-center" style={{ color: 'var(--text-3)' }}>{row.bench_threshold}</td>
                  <td className="num-center">
                    {row.breach_amount > 0
                      ? <span className="surplus-pos">+{row.breach_amount}</span>
                      : <span className="surplus-neg">{row.breach_amount}</span>}
                  </td>
                  <td>
                    <span className={`badge ${BADGE_CLASS[row.alert_severity]}`}>{SEV_LABEL[row.alert_severity]}</span>
                  </td>
                  <td className="narrative">{row.recommended_action}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-4)' }}>No rows match the selected filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}