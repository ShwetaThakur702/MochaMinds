import { useState } from 'react'
import { ActionItem, DigestData, NotificationItem } from '../types'
import NotificationBell from './NotificationBell'
import UploadModal from './UploadModal'

interface Props {
  offline: boolean
  lastUpdated: string | null
  dark: boolean
  onToggleDark: () => void
  digest: DigestData
  actions: ActionItem[]
  onUpload: (file: File) => Promise<void>
  uploading: boolean
  notifications: NotificationItem[]
  onMarkAllRead: () => void
}

function buildDailyReportText(digest: DigestData): string {
  const lines: string[] = [
    `BENCH AGENT — DAILY REPORT`,
    `Date: ${digest.run_date}`,
    ``,
    `EXECUTIVE SUMMARY`,
    `─────────────────`,
    digest.summary_text,
    ``,
    `BENCH METRICS`,
    `─────────────`,
    `Total bench:      ${digest.total_bench}`,
    `At-risk (>60d):   ${digest.at_risk_count}`,
    `NAFD:             ${digest.nafd_count} (${digest.nafd_pct}%)`,
    `Proposed:         ${digest.proposed_count}`,
    ``,
    `FORECAST`,
    `────────`,
    `7-day peak bench:  ${digest.bench_7d_forecast}`,
    `30-day peak bench: ${digest.bench_30d_forecast}`,
    ``,
    `THRESHOLD ALERTS`,
    `────────────────`,
    digest.breached_slices.length > 0
      ? `Breached: ${digest.breached_slices.join(', ')}`
      : 'No active threshold breaches.',
    digest.forecasted_breach_slices.length > 0
      ? `Forecasted breach (30d): ${digest.forecasted_breach_slices.join(', ')}`
      : '',
    ``,
    `HIRING FREEZE ADVISORY`,
    `──────────────────────`,
    digest.freeze_recommended_skills.length > 0
      ? `Freeze recommended: ${digest.freeze_recommended_skills.join(', ')}\nCombined surplus: ${digest.combined_surplus}`
      : 'No hiring freeze advisories.',
    ``,
    `TOP ORG SLICES BY HEADCOUNT`,
    `───────────────────────────`,
    ...Object.entries(digest.top_3_org_slices).map(([k, v]) => `  ${k}: ${v}`),
    ``,
    `AGING BREAKDOWN`,
    `───────────────`,
    ...Object.entries(digest.aging_breakdown).map(([k, v]) => `  ${k}: ${v}`),
  ]
  return lines.filter(l => l !== undefined).join('\n')
}

function buildMeetingAgendaText(digest: DigestData, actions: ActionItem[]): string {
  const immediate = actions.filter(a => a.priority === 'IMMEDIATE')
  const sevenDay  = actions.filter(a => a.priority === '7-DAY')
  const thirtyDay = actions.filter(a => a.priority === '30-DAY')

  const lines: string[] = [
    `BENCH REVIEW MEETING AGENDA`,
    `Date: ${digest.run_date}`,
    ``,
    `1. BENCH STATUS OVERVIEW (5 min)`,
    `   • Total bench: ${digest.total_bench}`,
    `   • At-risk (>60d, no proposed status): ${digest.at_risk_count}`,
    `   • NAFD: ${digest.nafd_count} (${digest.nafd_pct}%)`,
    ``,
    `2. IMMEDIATE ACTIONS — Decide Today (10 min)`,
  ]

  if (immediate.length === 0) {
    lines.push(`   • No immediate actions required.`)
  } else {
    immediate.forEach((a, i) => {
      lines.push(`   ${i + 1}. [${a.rule}] ${a.action}`)
      lines.push(`      Owner: ${a.owner}`)
    })
  }

  lines.push(``, `3. 7-DAY ACTIONS — Assign Owners (10 min)`)
  if (sevenDay.length === 0) {
    lines.push(`   • No 7-day actions.`)
  } else {
    sevenDay.forEach((a, i) => {
      lines.push(`   ${i + 1}. [${a.rule}] ${a.action}`)
      lines.push(`      Owner: ${a.owner}`)
    })
  }

  lines.push(``, `4. 30-DAY STRATEGIC ITEMS (5 min)`)
  if (thirtyDay.length === 0) {
    lines.push(`   • No 30-day items.`)
  } else {
    thirtyDay.forEach((a, i) => {
      lines.push(`   ${i + 1}. [${a.rule}] ${a.action}`)
      lines.push(`      Owner: ${a.owner}`)
    })
  }

  lines.push(
    ``,
    `5. THRESHOLD ALERTS (5 min)`,
    digest.breached_slices.length > 0
      ? `   • Active breaches: ${digest.breached_slices.join(', ')}`
      : `   • No active breaches.`,
    ``,
    `6. HIRING FREEZE STATUS (5 min)`,
    digest.freeze_recommended_skills.length > 0
      ? `   • Freeze recommended: ${digest.freeze_recommended_skills.slice(0, 5).join(', ')}${digest.freeze_recommended_skills.length > 5 ? ' …' : ''}`
      : `   • No hiring freeze advisories.`,
    ``,
    `7. AOB / Next Steps`,
  )

  return lines.join('\n')
}

function Modal({ title, content, onClose }: { title: string; content: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(content).catch(() => {/* silent */})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleDownload() {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/\s+/g, '_').toLowerCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <div className="modal-actions">
            <button className="modal-btn" onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</button>
            <button className="modal-btn" onClick={handleDownload}>Download</button>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="2" y1="2" x2="14" y2="14" /><line x1="14" y1="2" x2="2" y2="14" />
              </svg>
            </button>
          </div>
        </div>
        <pre className="modal-content">{content}</pre>
      </div>
    </div>
  )
}

export default function Header({ offline, lastUpdated, dark, onToggleDark, digest, actions, onUpload, uploading, notifications, onMarkAllRead }: Props) {
  const [showReport, setShowReport]   = useState(false)
  const [showAgenda, setShowAgenda]   = useState(false)
  const [showUpload, setShowUpload]   = useState(false)

  const reportText = buildDailyReportText(digest)
  const agendaText = buildMeetingAgendaText(digest, actions)

  return (
    <>
      <header className="app-header">
        <div className="header-logo">
          <div className="header-wordmark">
            <div className="header-title">
              <span className="brand-bench">Bench</span>
              <span className="brand-agent">Agent</span>
            </div>
            <div className="header-sub">Resource Management Intelligence — Advisory Only</div>
          </div>
        </div>

        <div className="header-right">
          <button
            className={`header-action-btn upload-btn ${uploading ? 'upload-btn-loading' : ''}`}
            onClick={() => !uploading && setShowUpload(true)}
            disabled={uploading}
            title="Upload a new RIS file (.xlsx or .csv)"
          >
            {uploading ? (
              <>
                <span className="upload-spinner" />
                Processing…
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="8 2 8 10" /><polyline points="4 6 8 2 12 6" />
                  <path d="M2 12v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" />
                </svg>
                Upload RIS
              </>
            )}
          </button>

          <button
            className="header-action-btn"
            title="Download full Excel report"
            onClick={() => {
              fetch('/api/bench/download')
                .then(r => r.blob())
                .then(blob => {
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `BA_Dashboard_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.xlsx`
                  a.click()
                  URL.revokeObjectURL(url)
                })
                .catch(() => alert('Excel file not available. Make sure the backend is running.'))
            }}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="8 2 8 10" /><polyline points="4 6 8 10 12 6" />
              <path d="M2 12v1a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-1" />
            </svg>
            Excel Report
          </button>

          <button className="header-action-btn" onClick={() => setShowReport(true)} title="View daily report">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" />
              <line x1="5" y1="6" x2="11" y2="6" /><line x1="5" y1="9" x2="11" y2="9" /><line x1="5" y1="12" x2="8" y2="12" />
            </svg>
            Daily Report
          </button>

          <button className="header-action-btn" onClick={() => setShowAgenda(true)} title="View meeting agenda">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="12" height="12" rx="1" />
              <line x1="2" y1="6" x2="14" y2="6" />
              <line x1="6" y1="2" x2="6" y2="6" />
              <line x1="10" y1="2" x2="10" y2="6" />
              <line x1="5" y1="9" x2="11" y2="9" /><line x1="5" y1="12" x2="9" y2="12" />
            </svg>
            Meeting Agenda
          </button>

          <NotificationBell notifications={notifications} onMarkAllRead={onMarkAllRead} />

          <span className={`status-chip ${offline ? 'status-chip-offline' : 'status-chip-live'}`}>
            <span className="status-dot" />
            {offline ? 'Offline' : 'Live'}
          </span>

          {lastUpdated && (
            <span className="timestamp">{lastUpdated}</span>
          )}

          <button
            className="dark-toggle"
            onClick={onToggleDark}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
            <div className="toggle-track">
              <div className="toggle-knob" />
            </div>
            <span>{dark ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      {showUpload && (
        <UploadModal
          uploading={uploading}
          onUpload={onUpload}
          onClose={() => setShowUpload(false)}
        />
      )}
      {showReport && (
        <Modal title="Daily Report" content={reportText} onClose={() => setShowReport(false)} />
      )}
      {showAgenda && (
        <Modal title="Meeting Agenda" content={agendaText} onClose={() => setShowAgenda(false)} />
      )}
    </>
  )
}
