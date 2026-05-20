import { useState } from 'react'
import { FreezeRow } from '../types'
import { downloadCSV, printToPDF, todayStr } from '../utils/download'
import PsidTooltip from './PsidTooltip'

interface Props { data: FreezeRow[] }

function buildFreezeEmail(row: FreezeRow): { subject: string; body: string } {
  const subject = `Hiring Freeze Advisory — ${row.skill} Cluster`
  const narrative = row.llm_narrative ?? row.advisory_note ?? 'No AI advisory available.'
  const coverageRatio = row.coverage_ratio != null ? row.coverage_ratio.toFixed(2) : 'N/A'
  const confidence = row.match_confidence ?? 'N/A'
  const stale = row.stale_match_count ?? 'N/A'
  const pending = row.endorsement_pending_count ?? 'N/A'

  const body = `Hi Talent Acquisition Team,

This is an automated advisory from the Bench Agent.

The ${row.skill} skill cluster currently has ${row.total_supply} bench employees against ${row.open_demand_count} open demand lines — a surplus of ${row.supply_surplus}.

Recommendation: Pause all active hiring requisitions for ${row.skill} roles.

AI Advisory: ${narrative}

Coverage Ratio: ${coverageRatio} | Confidence: ${confidence}
Stale Skill Records: ${stale} | Pending Endorsements: ${pending}

This is an advisory recommendation only. All final decisions rest with leadership.
— Bench Agent (automated)`

  return { subject, body }
}

function FreezeEmailPanel({ row }: { row: FreezeRow }) {
  const [copied, setCopied] = useState(false)
  const { subject, body } = buildFreezeEmail(row)

  function handleCopy() {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).catch(() => {/* silent */})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <tr className="freeze-email-row">
      <td colSpan={7}>
        <div className="email-panel">
          <div className="email-panel-header">
            <span className="email-panel-label">Draft Email — Talent Acquisition</span>
            <button className="copy-email-btn" onClick={handleCopy}>
              {copied ? '✓ Copied' : 'Copy Email'}
            </button>
          </div>
          <div className="email-subject">Subject: {subject}</div>
          <pre className="email-body-pre">{body}</pre>
        </div>
      </td>
    </tr>
  )
}

type FreezeFilter = 'ALL' | 'FREEZE' | 'NO_FREEZE'

export default function HiringFreeze({ data }: Props) {
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null)
  const [freezeFilter, setFreezeFilter] = useState<FreezeFilter>('ALL')

  const freezeCount   = data.filter((r) => r.freeze_recommended).length
  const noFreezeCount = data.length - freezeCount

  const freezeRows = data.filter((r) => r.freeze_recommended)
  const avgSurplusFreeze = freezeRows.length
    ? Math.round(freezeRows.reduce((a, r) => a + r.supply_surplus, 0) / freezeRows.length)
    : 0

  const filtered = freezeFilter === 'ALL' ? data
    : freezeFilter === 'FREEZE' ? data.filter(r => r.freeze_recommended)
    : data.filter(r => !r.freeze_recommended)

  function toggleExpand(skill: string) {
    setExpandedSkill(prev => prev === skill ? null : skill)
  }

  return (
    <section>
      <h2 className="section-title">
        <span className="section-title-icon">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="1" x2="8" y2="15" />
            <line x1="1" y1="8" x2="15" y2="8" />
            <line x1="3.17" y1="3.17" x2="12.83" y2="12.83" />
            <line x1="12.83" y1="3.17" x2="3.17" y2="12.83" />
          </svg>
        </span>
        Hiring Freeze Advisory
        <span className="section-count">{data.length} skills · {freezeCount} freeze recommended</span>
        <span className="section-dl-btns">
          <button className="dl-btn" onClick={() => downloadCSV(data as unknown as Record<string, unknown>[], `hiring_freeze_${todayStr()}.csv`)}>⬇ CSV</button>
          <button className="dl-btn" onClick={() => printToPDF(`BenchAgent - Hiring Freeze - ${todayStr()}`)}>⬇ PDF</button>
        </span>
      </h2>

      <div className="freeze-header-stats">
        <div className="freeze-stat freeze-stat-freeze">
          <div className="freeze-stat-val">{freezeCount}</div>
          <div className="freeze-stat-lbl">Freeze Recommended</div>
        </div>
        <div className="freeze-stat">
          <div className="freeze-stat-val">{noFreezeCount}</div>
          <div className="freeze-stat-lbl">No Freeze Needed</div>
        </div>
        <div className="freeze-stat" style={{ borderColor: 'rgba(16,185,129,.2)', background: 'rgba(16,185,129,.07)' }}>
          <div className="freeze-stat-val" style={{ color: 'var(--green)' }}>{data.length}</div>
          <div className="freeze-stat-lbl">Total Skills Tracked</div>
        </div>
        <div className="freeze-stat" style={{ borderColor: 'rgba(245,158,11,.2)', background: 'rgba(245,158,11,.07)' }}>
          <div className="freeze-stat-val" style={{ color: 'var(--amber)' }}>+{avgSurplusFreeze}</div>
          <div className="freeze-stat-lbl">Avg Surplus (Frozen)</div>
        </div>
      </div>

      <div className="freeze-filter-bar">
        {(['ALL', 'FREEZE', 'NO_FREEZE'] as FreezeFilter[]).map(f => (
          <button
            key={f}
            className={`freeze-filter-btn${freezeFilter === f ? ' freeze-filter-active' : ''}`}
            onClick={() => setFreezeFilter(f)}
          >
            {f === 'ALL' ? `All (${data.length})` : f === 'FREEZE' ? `Freeze (${freezeCount})` : `No Freeze (${noFreezeCount})`}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-scroll" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Skill</th>
                <th className="num-center">Supply</th>
                <th className="num-center">Demand</th>
                <th className="num-center">Surplus / Deficit</th>
                <th className="num-center">Avg Rating</th>
                <th>Freeze</th>
                <th>Advisory</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isExpanded = expandedSkill === row.skill
                return (
                  <>
                    <tr key={row.skill} className={row.freeze_recommended ? 'r-freeze' : ''}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong className="skill-name">{row.skill}</strong>
                          {row.freeze_recommended && (
                            <button
                              className="freeze-expand-btn"
                              onClick={() => toggleExpand(row.skill)}
                              title={isExpanded ? 'Collapse email draft' : 'Draft email'}
                              aria-expanded={isExpanded}
                            >
                              <svg
                                width="12" height="12" viewBox="0 0 12 12"
                                fill="none" stroke="currentColor" strokeWidth="2"
                                strokeLinecap="round" strokeLinejoin="round"
                                style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
                              >
                                <polyline points="2 4 6 8 10 4" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="num-center"><PsidTooltip count={row.total_supply} psids={row.supply_psids} /></td>
                      <td className="num-center" style={{ color: 'var(--text-3)' }}>{row.open_demand_count}</td>
                      <td className="num-center">
                        {row.supply_surplus > 0
                          ? <span className="surplus-pos">+{row.supply_surplus}</span>
                          : <span className="surplus-neg">{row.supply_surplus}</span>}
                      </td>
                      <td className="num-center">
                        {row.avg_skill_rating != null
                          ? <span className="star-rating"><span className="star">★</span>{row.avg_skill_rating.toFixed(1)}</span>
                          : <span style={{ color: 'var(--text-4)' }}>—</span>}
                      </td>
                      <td>
                        <span className={`badge ${row.freeze_recommended ? 'b-freeze' : 'b-nofreeze'}`}>
                          {row.freeze_recommended ? 'Freeze' : 'No Freeze'}
                        </span>
                      </td>
                      <td className="narrative">{row.llm_narrative ?? row.advisory_note}</td>
                    </tr>
                    {isExpanded && <FreezeEmailPanel key={`email-${row.skill}`} row={row} />}
                  </>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-4)' }}>No rows match the selected filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}