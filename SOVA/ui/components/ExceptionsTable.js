import React, { useState, useMemo } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Filter, Info, X } from 'lucide-react'
import clsx from 'clsx'

// ── Full rule definitions ─────────────────────────────────────────────────
const RULE_META = {
  R1: {
    id: 'R1', name: 'Billing Start Date', severity: 'High',
    severityCls: 'badge-high', dot: 'bg-red-400', color: 'text-red-400',
    severityReason: 'Incorrect billing dates directly impact revenue realization and financial compliance.',
    description: 'Expected Billing Start Date must be at least 30 days after the SO Submission Date. Flags SOs where the gap is too tight (< 30 days) or where the billing date precedes the request date entirely.',
    checks: ['Billing date before request date → flagged', 'Gap between billing and request < 30 days → flagged'],
    fields: ['Expected Billing Start Date', 'SO Submission Date'],
  },
  R2: {
    id: 'R2', name: 'Geo / Location Consistency', severity: 'Medium',
    severityCls: 'badge-medium', dot: 'bg-amber-400', color: 'text-amber-400',
    severityReason: 'Mismatches cause incorrect tax/compliance routing, requiring correction but not immediately blocking work.',
    description: 'The Hiring GeoLocation code, Work Location Country, and Onsite/Offshore must be logically consistent. An Onsite SO with a Germany geo code must show Germany as the work country — not India or the US.',
    checks: ['HiringGeo code implies an expected country', 'Work Location Country must match geo expectation', 'Offshore SOs always map to India — no mismatch possible'],
    fields: ['Hiring Geo/Location', 'Requirement Location', 'Country'],
  },
  R3: {
    id: 'R3', name: 'Cluster Group Match', severity: 'Medium',
    severityCls: 'badge-medium', dot: 'bg-amber-400', color: 'text-amber-400',
    severityReason: 'Affects internal reporting and P&L attribution, leading to organizational data skew.',
    description: "The SO's ClusterGroup must match the Hiring Manager's ClusterGroup as recorded in RIS master data. Mismatches mean the SO was raised under the wrong organisational cluster.",
    checks: ['SO ClusterGroup looked up against Hiring Manager PSID in RIS', "RIS master data is the authoritative source for manager cluster", 'PSIDs not found in RIS are skipped with a config warning — not flagged as violations'],
    fields: ['SL/IND_CLUSTER', 'PSID of Hiring Manager'],
  },
  R4: {
    id: 'R4', name: 'Currency Mapping', severity: 'Medium',
    severityCls: 'badge-medium', dot: 'bg-amber-400', color: 'text-amber-400',
    severityReason: 'Causes downstream billing confusion, but can be rectified manually during invoicing.',
    description: "The expected billing currency is derived from the Hiring Geo code (e.g. I2DEU → Germany → EUR). This is compared against the currency for the Work Location Country. A mismatch means the SO has inconsistent billing geography — the geo code points to one country but the work location says another.",
    checks: ['HiringGeo code decoded to expected billing country', 'Expected country mapped to its ISO currency', 'Work Location Country mapped to its currency', 'If the two currencies differ → flagged', 'Offshore SOs are excluded (always India)'],
    fields: ['Hiring Geo/Location', 'Requirement Location', 'Country'],
  },
  R5: {
    id: 'R5', name: 'JD Quality', severity: 'Low',
    severityCls: 'badge-low', dot: 'bg-green-400', color: 'text-green-400',
    severityReason: 'Poor descriptions impact sourcing efficiency but do not strictly violate financial or operational compliance.',
    description: 'The SO Job Description must meet a minimum quality standard. Evaluated using heuristics only — no AI or LLM is used (TC2 compliant). If Description is absent, falls back to Job Title + Skills + Keywords combined.',
    checks: ['Description field absent → flagged as MISSING_DESCRIPTION', 'Combined JD content under minimum word count → flagged as TOO_SHORT', 'Primary Skill Set missing → flagged', 'Keywords missing → flagged', 'Job Title missing → flagged'],
    fields: ['Description', 'Project Role', 'Primary Skill Description', 'Keywords'],
  },
}

const RULES = ['R1','R2','R3','R4','R5']
const SEVS  = ['High','Medium','Low']
const SEV_MAP = {
  High:   { cls: 'badge-high',   dot: 'bg-red-400' },
  Medium: { cls: 'badge-medium', dot: 'bg-amber-400' },
  Low:    { cls: 'badge-low',    dot: 'bg-green-400' },
}

// ── Tooltip popup ────────────────────────────────────────────────────────
function RuleTooltip({ rule, onClose }) {
  const m = RULE_META[rule]
  if (!m) return null
  return (
    <div className="absolute z-50 top-10 left-0 w-80 rounded-xl border border-[var(--border-bright)] bg-[#141f1a] shadow-2xl p-4"
      style={{ animation: 'fadeIn 0.15s ease forwards' }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-xs font-bold text-[var(--green-primary)]">{m.id}</span>
            <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded-full', m.severityCls)}>{m.severity}</span>
          </div>
          <div className="font-semibold text-sm text-[var(--text-primary)]">{m.name}</div>
        </div>
        <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text-muted)] mt-0.5 ml-2 flex-shrink-0">
          <X size={13} />
        </button>
      </div>
      <div className="mb-3 p-2 bg-[var(--bg-card-hover)] border border-[var(--border)] rounded-lg">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1">Why is this {m.severity}?</div>
        <p className="text-[11px] text-[var(--text-primary)] leading-snug">{m.severityReason}</p>
      </div>
      <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">{m.description}</p>
      <div className="mb-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-dim)] mb-1.5">What it checks</div>
        <ul className="space-y-1">
          {m.checks.map((c, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
              <span className="text-[var(--green-primary)] mt-0.5 flex-shrink-0">›</span>{c}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-dim)] mb-1.5">SO Fields Used</div>
        <div className="flex flex-wrap gap-1">
          {m.fields.map(f => (
            <span key={f} className="text-[10px] font-mono bg-[rgba(35,150,96,0.1)] text-green-400 px-1.5 py-0.5 rounded border border-[var(--border)]">{f}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Rule legend grid ─────────────────────────────────────────────────────
function RuleLegend() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-2 px-6 py-4 border-b border-[var(--border)] bg-[rgba(0,0,0,0.15)]">
      {RULES.map(r => {
        const m = RULE_META[r]
        return (
          <div key={r} className="flex flex-col gap-1.5 p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-bright)] transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-[var(--green-primary)]">{r}</span>
              <span className={clsx('text-[10px] font-mono px-1.5 py-0.5 rounded-full', m.severityCls)}>{m.severity}</span>
            </div>
            <div className="text-xs font-semibold text-[var(--text-primary)]">{m.name}</div>
            <div className="text-[11px] text-[var(--text-dim)] leading-relaxed">{m.description.split('.')[0]}.</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {m.fields.map(f => (
                <span key={f} className="text-[9px] font-mono bg-[rgba(35,150,96,0.08)] text-[var(--text-dim)] px-1 py-0.5 rounded">{f}</span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────
export default function ExceptionsTable({ exceptions }) {
  const [ruleFilter, setRuleFilter] = useState(new Set(RULES))
  const [sevFilter,  setSevFilter]  = useState(new Set(SEVS))
  const [expanded,   setExpanded]   = useState(null)
  const [page,       setPage]       = useState(1)
  const [tooltip,    setTooltip]    = useState(null)
  const [showLegend, setShowLegend] = useState(false)
  const PAGE_SIZE = 15

  const toggleRule = (r) => { setRuleFilter(p => { const n=new Set(p); n.has(r)?n.delete(r):n.add(r); return n }); setPage(1) }
  const toggleSev  = (s) => { setSevFilter(p  => { const n=new Set(p); n.has(s)?n.delete(s):n.add(s); return n }); setPage(1) }

  const filtered = useMemo(() =>
    exceptions.filter(e => ruleFilter.has(e['Rule ID']) && sevFilter.has(e['Severity'])),
    [exceptions, ruleFilter, sevFilter]
  )
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE)
  const counts = useMemo(() => {
    const c={}; exceptions.forEach(e=>{c[e['Rule ID']]=(c[e['Rule ID']]||0)+1}); return c
  }, [exceptions])

  return (
    <div className="card animate-fade-up opacity-0 stagger-4" style={{ animationFillMode:'forwards' }} onClick={()=>setTooltip(null)}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-500" />
          <span className="font-display font-semibold text-[var(--text-primary)] text-lg">Exceptions</span>
          <span className="text-xs bg-[rgba(35,150,96,0.1)] text-[var(--green-primary)] px-2 py-0.5 rounded-full border border-[var(--border-bright)] font-semibold">
            {filtered.length} of {exceptions.length}
          </span>
        </div>
        <button
          onClick={e=>{e.stopPropagation();setShowLegend(v=>!v)}}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all',
            showLegend
              ? 'bg-[var(--green-primary)] border-[var(--green-primary)] text-white'
              : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-bright)]'
          )}
        >
          <Info size={12} /> Rule Guide
        </button>
      </div>

      {/* Legend */}
      {showLegend && <RuleLegend />}

      {/* Filters */}
      <div className="px-6 py-4 border-b border-[var(--border)] flex flex-wrap gap-6 items-center bg-[var(--bg-card-hover)]">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Rules</span>
          {RULES.map(r => (
            <div key={r} className="relative flex items-stretch" onClick={e=>e.stopPropagation()}>
              <button
                onClick={()=>toggleRule(r)}
                className={clsx(
                  'text-xs pl-2.5 pr-1.5 py-1 rounded-l-full border-y border-l font-mono transition-all',
                  ruleFilter.has(r)
                    ? 'bg-[var(--green-primary)] border-[var(--green-primary)] text-white'
                    : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border-bright)]'
                )}
              >
                {r}{counts[r]?<span className="opacity-70 ml-1">·{counts[r]}</span>:''}
              </button>
              <button
                onClick={()=>setTooltip(tooltip===r?null:r)}
                title={`What is ${r}?`}
                className={clsx(
                  'text-xs px-1.5 py-1 rounded-r-full border-y border-r transition-all border-l border-l-white/10',
                  ruleFilter.has(r)
                    ? 'bg-[var(--green-primary)] border-[var(--green-primary)] text-white/60 hover:text-white'
                    : 'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border-bright)]'
                )}
              ><Info size={10}/></button>
              {tooltip===r && <RuleTooltip rule={r} onClose={()=>setTooltip(null)}/>}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider">Severity</span>
          {SEVS.map(s=>(
            <button key={s} onClick={()=>toggleSev(s)}
              className={clsx('text-xs px-2.5 py-1 rounded-full border font-mono transition-all',
                sevFilter.has(s)?SEV_MAP[s].cls:'border-[var(--border)] text-[var(--text-dim)] hover:border-[var(--border-bright)]'
              )}>{s}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--bg-card)]">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] w-28">SO ID</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] w-48">Customer</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] w-64">Rule</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] w-28">Severity</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] min-w-[300px]">Exception</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] min-w-[250px]">Action</th>
              <th className="w-10"/>
            </tr>
          </thead>
          <tbody>
            {paged.map((row,i)=>{
              const sev=SEV_MAP[row['Severity']]||SEV_MAP.Low
              const meta=RULE_META[row['Rule ID']]
              const isOpen=expanded===i
              return (
                <React.Fragment key={i}>
                  <tr className="trow border-b border-[var(--border)] cursor-pointer transition-colors"
                    onClick={()=>setExpanded(isOpen?null:i)}>
                    <td className="px-5 py-4 font-mono text-[13px] font-semibold text-[var(--green-primary)]">{row['SO ID']}</td>
                    <td className="px-5 py-4 text-[13px] font-medium text-[var(--text-muted)] truncate max-w-[12rem]">{row['Customer Name']}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-bold text-[var(--text-primary)]">{row['Rule ID']}</span>
                        {meta && <span className="text-xs text-[var(--text-dim)] truncate max-w-[14rem]">{meta.name}</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={clsx('text-[11px] font-bold px-2.5 py-1 rounded-full',sev.cls)}>{row['Severity']}</span>
                    </td>
                    <td className="px-5 py-4 text-[13px] text-[var(--text-muted)]">
                      <div className="truncate max-w-sm" title={row['Exception Reason']}>{row['Exception Reason']}</div>
                    </td>
                    <td className="px-5 py-4 text-[13px] text-[var(--text-dim)]">
                      <div className="truncate max-w-[16rem]" title={row['Recommended Action']}>{row['Recommended Action']}</div>
                    </td>
                    <td className="px-5 py-4">
                      {isOpen?<ChevronUp size={16} className="text-[var(--text-primary)]"/>:<ChevronDown size={16} className="text-[var(--text-dim)]"/>}
                    </td>
                  </tr>
                  {isOpen&&(
                    <tr key={`exp-${i}`} className="bg-[rgba(35,150,96,0.04)]">
                      <td colSpan={7} className="px-8 py-6">
                        {/* Rule explanation banner */}
                        {meta&&(
                          <div className="mb-6 p-4 rounded-xl border border-[var(--border-bright)] bg-[var(--bg-card)] shadow-sm">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-bold text-sm text-[var(--green-primary)]">{meta.id}</span>
                              <span className="text-sm font-semibold text-[var(--text-primary)]">{meta.name}</span>
                              <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full',meta.severityCls)}>{meta.severity}</span>
                            </div>
                            <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-3">{meta.description}</p>
                            <div className="mb-3 p-3 bg-[rgba(0,0,0,0.05)] border border-[var(--border)] rounded-lg">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1">Why is this flagged as {meta.severity}?</div>
                              <p className="text-[11px] text-[var(--text-primary)]">{meta.severityReason}</p>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {meta.fields.map(f=>(
                                <span key={f} className="text-[10px] font-mono bg-[rgba(35,150,96,0.1)] text-green-400 px-1.5 py-0.5 rounded border border-[var(--border)]">{f}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                          {[
                            ['Expected Billing Date',row['Expected Billing Start Date']],
                            ['Work Location',`${row['Work Location City']}, ${row['Work Location Country']}`],
                            ['SO Cluster',row['SO ClusterGroup']],
                            ['Mgr Cluster',row['Manager ClusterGroup']],
                            ['Hiring Geo',row['Hiring GeoLocation']],
                            ['Onsite/Offshore',row['Onsite/Offshore']],
                            ['Actual Currency',row['Budgeted CTC Currency']],
                            ['Recommended Currency',row['Recommended Currency']],
                            ['JD Quality Flag',row['Description Quality Flag']],
                            ['Primary Skill',row['Primary Skill Set']],
                            ['Job Title',row['Job Title']],
                            ['PSID',row['PSID of Hiring Manager']],
                          ].map(([label,val])=>val&&val!=='N/A'&&!val.includes('undefined')&&(
                            <div key={label}>
                              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1">{label}</div>
                              <div className="text-[var(--text-primary)] font-medium">{val}</div>
                            </div>
                          ))}
                          <div className="col-span-2 md:col-span-4 mt-2">
                            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-dim)] mb-1.5">Full Exception Detail</div>
                            <div className="text-[var(--text-primary)] leading-relaxed bg-[var(--bg-card)] p-3 rounded-lg border border-[var(--border)]">{row['Exception Reason']}</div>
                          </div>
                          <div className="col-span-2 md:col-span-4 p-4 rounded-xl bg-[rgba(35,150,96,0.08)] border border-[var(--border-bright)]">
                            <div className="text-xs font-bold uppercase tracking-wider text-[var(--green-primary)] mb-1.5">Recommended Action</div>
                            <div className="text-[var(--text-muted)]">{row['Recommended Action']}</div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages>1&&(
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)] bg-[var(--bg-card-hover)]">
          <span className="text-sm text-[var(--text-dim)] font-medium">Page {page} of {totalPages} · {filtered.length} results</span>
          <div className="flex gap-2">
            <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-bright)] disabled:opacity-30 transition-all">Prev</button>
            <button onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
              className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-bright)] disabled:opacity-30 transition-all">Next</button>
          </div>
        </div>
      )}
    </div>
  )
}
