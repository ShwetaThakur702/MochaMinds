import { useState } from 'react'
import { ActionItem, ActionPriority, RmNudge } from '../types'
import { downloadCSV, printToPDF, todayStr } from '../utils/download'
import { sendToTeams } from '../api'

interface Props {
  actions: ActionItem[]
  nudges: RmNudge[]
}

const PRIORITY_ORDER: ActionPriority[] = ['IMMEDIATE', '7-DAY', '30-DAY']

const PRIORITY_META: Record<ActionPriority, { label: string; className: string }> = {
  'IMMEDIATE': { label: 'Immediate', className: 'priority-immediate' },
  '7-DAY':     { label: '7-Day',     className: 'priority-7day' },
  '30-DAY':    { label: '30-Day',    className: 'priority-30day' },
}

const CATEGORY_META: Record<string, string> = {
  AT_RISK:           'at-risk',
  THRESHOLD_BREACH:  'breach',
  HIRING_FREEZE:     'freeze',
  FORECASTED_BREACH: 'forecast',
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).catch(() => {/* silent */})
}

type TeamsState = 'idle' | 'sending' | 'sent' | 'skipped' | 'error'

function ActionCard({ item }: { item: ActionItem }) {
  const [copied, setCopied] = useState(false)
  const [teamsState, setTeamsState] = useState<TeamsState>('idle')
  const meta = PRIORITY_META[item.priority]

  function handleCopy() {
    copyText(`[${item.rule}] ${item.action}\n\nRationale: ${item.rationale}\nOwner: ${item.owner}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleTeams() {
    if (teamsState === 'sending') return
    setTeamsState('sending')
    try {
      const result = await sendToTeams(
        `[${item.rule}] ${item.action}\n\nOwner: ${item.owner}\nRationale: ${item.rationale}`,
        'HIGH',
        item.priority,
      )
      setTeamsState(result.status === 'sent' ? 'sent' : 'skipped')
    } catch {
      setTeamsState('error')
    }
    setTimeout(() => setTeamsState('idle'), 2000)
  }

  const teamsLabel: Record<TeamsState, string> = {
    idle:    '📣 Take Action',
    sending: 'Sending…',
    sent:    '✓ Sent to Teams',
    skipped: '⚠ Teams not configured',
    error:   '✗ Failed',
  }
  const teamsClass: Record<TeamsState, string> = {
    idle:    'teams-btn',
    sending: 'teams-btn teams-sending',
    sent:    'teams-btn teams-sent',
    skipped: 'teams-btn teams-skipped',
    error:   'teams-btn teams-error',
  }

  return (
    <div className={`action-card ${meta.className}`}>
      <div className="action-card-header">
        <span className="action-rule-badge">{item.rule}</span>
        <span className="action-owner">{item.owner}</span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {item.priority === 'IMMEDIATE' && (
            <button className={teamsClass[teamsState]} onClick={handleTeams} disabled={teamsState === 'sending'}>
              {teamsLabel[teamsState]}
            </button>
          )}
          <button className="copy-btn" onClick={handleCopy} title="Copy action">
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2 8 6 12 14 4" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="5" width="9" height="9" rx="1" />
                <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
              </svg>
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <p className="action-text">{item.action}</p>
      <p className="action-rationale">{item.rationale}</p>
    </div>
  )
}

function NudgeCard({ nudge }: { nudge: RmNudge }) {
  const [copied, setCopied] = useState(false)
  const [emailCopied, setEmailCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const cls = CATEGORY_META[nudge.category] ?? 'other'

  const hasEmail = Boolean(nudge.email_subject && nudge.email_body)

  function handleCopy() {
    copyText(nudge.nudge_text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleCopyEmail() {
    copyText(`Subject: ${nudge.email_subject}\n\n${nudge.email_body}`)
    setEmailCopied(true)
    setTimeout(() => setEmailCopied(false), 1500)
  }

  return (
    <div className={`nudge-card nudge-${cls}`}>
      <div className="nudge-header">
        <span className="nudge-category">{nudge.category.replace(/_/g, ' ')}</span>
        <span className="nudge-target">{nudge.org_slice_or_skill}</span>
        {nudge.urgency && (
          <span className={`nudge-urgency nudge-urgency-${nudge.urgency.toLowerCase()}`}>{nudge.urgency}</span>
        )}
        <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
          {hasEmail && (
            <button
              className="copy-btn"
              onClick={() => setExpanded(e => !e)}
              title={expanded ? 'Hide email draft' : 'Show email draft'}
            >
              <svg
                width="13" height="13" viewBox="0 0 16 16"
                fill="none" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}
              >
                <polyline points="2 5 8 11 14 5" />
              </svg>
              Email
            </button>
          )}
          <button className="copy-btn" onClick={handleCopy} title="Copy nudge text">
            {copied ? (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2 8 6 12 14 4" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="5" width="9" height="9" rx="1" />
                <path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2" />
              </svg>
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <p className="nudge-text">{nudge.nudge_text}</p>
      {expanded && hasEmail && (
        <div className="nudge-email-section">
          <div className="email-panel">
            <div className="email-panel-header">
              <span className="email-panel-label">Draft Email — Resource Manager</span>
              <button className="copy-email-btn" onClick={handleCopyEmail}>
                {emailCopied ? '✓ Copied' : 'Copy Email'}
              </button>
            </div>
            <div className="email-subject">Subject: {nudge.email_subject}</div>
            <pre className="email-body-pre">{nudge.email_body}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default function RecommendedActions({ actions, nudges }: Props) {
  const [activeSection, setActiveSection] = useState<'actions' | 'nudges'>('actions')

  const grouped = PRIORITY_ORDER.reduce<Record<ActionPriority, ActionItem[]>>(
    (acc, p) => { acc[p] = actions.filter(a => a.priority === p); return acc },
    { IMMEDIATE: [], '7-DAY': [], '30-DAY': [] },
  )

  return (
    <div className="recommended-actions">
      <div className="section-toggle">
        <button
          className={`toggle-btn ${activeSection === 'actions' ? 'active' : ''}`}
          onClick={() => setActiveSection('actions')}
        >
          Action Items ({actions.length})
        </button>
        <button
          className={`toggle-btn ${activeSection === 'nudges' ? 'active' : ''}`}
          onClick={() => setActiveSection('nudges')}
        >
          RM Nudges ({nudges.length})
        </button>
      </div>

      {activeSection === 'actions' && (
        <div className="actions-body">
          <div className="section-dl-bar">
            <button className="dl-btn" onClick={() => downloadCSV(actions as unknown as Record<string, unknown>[], `action_items_${todayStr()}.csv`)}>⬇ CSV</button>
            <button className="dl-btn" onClick={() => printToPDF(`BenchAgent - Action Items - ${todayStr()}`)}>⬇ PDF</button>
          </div>
          {actions.length === 0 ? (
            <p className="empty-state">No action items for this run.</p>
          ) : (
            PRIORITY_ORDER.map(priority => (
              grouped[priority].length > 0 && (
                <section key={priority} className="priority-group">
                  <h3 className={`priority-heading ${PRIORITY_META[priority].className}`}>
                    <span className="priority-dot" />
                    {PRIORITY_META[priority].label}
                    <span className="priority-count">{grouped[priority].length}</span>
                  </h3>
                  <div className="action-cards">
                    {grouped[priority].map((item, i) => (
                      <ActionCard key={i} item={item} />
                    ))}
                  </div>
                </section>
              )
            ))
          )}
        </div>
      )}

      {activeSection === 'nudges' && (
        <div className="nudges-body">
          <div className="section-dl-bar">
            <button className="dl-btn" onClick={() => downloadCSV(nudges.map(n => ({ nudge_id: n.nudge_id, category: n.category, org_slice_or_skill: n.org_slice_or_skill, urgency: n.urgency, nudge_text: n.nudge_text, run_date: n.run_date })) as Record<string, unknown>[], `rm_nudges_${todayStr()}.csv`)}>⬇ CSV</button>
            <button className="dl-btn" onClick={() => printToPDF(`BenchAgent - RM Nudges - ${todayStr()}`)}>⬇ PDF</button>
          </div>
          {nudges.length === 0 ? (
            <p className="empty-state">No RM nudges for this run.</p>
          ) : (
            <div className="nudge-cards">
              {nudges.map(n => <NudgeCard key={n.nudge_id} nudge={n} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
