import { useEffect, useRef, useState } from 'react'
import { NotificationItem } from '../types'
import { sendToTeams } from '../api'

interface Props {
  notifications: NotificationItem[]
  onMarkAllRead: () => void
}

const TYPE_LABELS: Record<string, string> = {
  THRESHOLD_BREACH:      'Threshold Alerts',
  CRITICAL_UNDERSTAFFING:'Critical Understaffing',
  AT_RISK:               'At Risk',
  HIRING_FREEZE:         'Hiring Freeze',
}

const TYPE_ORDER = ['THRESHOLD_BREACH', 'CRITICAL_UNDERSTAFFING', 'AT_RISK', 'HIRING_FREEZE']

const SEV_CLASS: Record<string, string> = {
  CRITICAL: 'nsev-critical',
  HIGH:     'nsev-high',
  MEDIUM:   'nsev-medium',
  LOW:      'nsev-low',
}

function fmtTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ts
  }
}

type NTeamsState = 'idle' | 'sending' | 'sent' | 'skipped' | 'error'

function NotifyTeamsBtn({ notification }: { notification: NotificationItem }) {
  const [state, setState] = useState<NTeamsState>('idle')

  async function handle() {
    if (state === 'sending') return
    setState('sending')
    try {
      const result = await sendToTeams(notification.message, notification.severity, notification.type)
      setState(result.status === 'sent' ? 'sent' : 'skipped')
    } catch {
      setState('error')
    }
    setTimeout(() => setState('idle'), 2000)
  }

  const label: Record<NTeamsState, string> = {
    idle:    '📣 Notify Team',
    sending: 'Sending…',
    sent:    '✓ Sent',
    skipped: '⚠ Not configured',
    error:   '✗ Failed',
  }
  const cls: Record<NTeamsState, string> = {
    idle:    'nbell-teams-btn',
    sending: 'nbell-teams-btn teams-sending',
    sent:    'nbell-teams-btn teams-sent',
    skipped: 'nbell-teams-btn teams-skipped',
    error:   'nbell-teams-btn teams-error',
  }

  return (
    <button className={cls[state]} onClick={handle} disabled={state === 'sending'}>
      {label[state]}
    </button>
  )
}

export default function NotificationBell({ notifications, onMarkAllRead }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const unread = notifications.filter(n => !n.read).length

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  // Group by type, maintaining preferred order
  const grouped: Record<string, NotificationItem[]> = {}
  for (const n of notifications) {
    if (!grouped[n.type]) grouped[n.type] = []
    grouped[n.type].push(n)
  }
  const orderedTypes = [
    ...TYPE_ORDER.filter(t => grouped[t]),
    ...Object.keys(grouped).filter(t => !TYPE_ORDER.includes(t)),
  ]

  return (
    <div className="nbell-wrap" ref={wrapRef}>
      <button
        className="nbell-btn"
        onClick={() => setOpen(o => !o)}
        aria-label={`${unread} unread notifications`}
        title="Notifications"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="nbell-badge">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="nbell-dropdown">
          <div className="nbell-header">
            <span className="nbell-title">Notifications</span>
            <span className="nbell-count">{notifications.length} total · {unread} unread</span>
            {unread > 0 && (
              <button className="nbell-mark-read" onClick={() => { onMarkAllRead(); }}>
                Mark all read
              </button>
            )}
          </div>

          <div className="nbell-scroll">
            {notifications.length === 0 ? (
              <p className="nbell-empty">No notifications.</p>
            ) : (
              orderedTypes.map(type => (
                <div key={type} className="nbell-group">
                  <div className="nbell-group-label">
                    {TYPE_LABELS[type] ?? type}
                    <span className="nbell-group-count">{grouped[type].length}</span>
                  </div>
                  {grouped[type].map(n => (
                    <div key={n.id} className={`nbell-item${n.read ? ' nbell-item-read' : ''}`}>
                      <span className={`nbell-sev ${SEV_CLASS[n.severity] ?? 'nsev-medium'}`}>
                        {n.severity}
                      </span>
                      <div className="nbell-msg-wrap">
                        <span className="nbell-msg">{n.message}</span>
                        {(n.severity === 'CRITICAL' || n.severity === 'HIGH') && (
                          <NotifyTeamsBtn notification={n} />
                        )}
                      </div>
                      <span className="nbell-time">{fmtTime(n.timestamp)}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
