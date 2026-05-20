import { useState, useEffect } from 'react'
import { LayoutDashboard, History, CheckCircle2, AlertCircle, MapPin, Users, DollarSign, FileText, Bell, X, Moon, Sun } from 'lucide-react'
import clsx from 'clsx'
import axios from 'axios'

const API = 'http://127.0.0.1:8000'

const RULES = [
  { id: 'R1', label: 'Billing Start Date',      color: 'text-red-400',    dot: 'bg-red-400',    severity: 'High' },
  { id: 'R2', label: 'Geo / Location',           color: 'text-amber-400',  dot: 'bg-amber-400',  severity: 'Medium' },
  { id: 'R3', label: 'Cluster Group Match',      color: 'text-amber-400',  dot: 'bg-amber-400',  severity: 'Medium' },
  { id: 'R4', label: 'Currency Mapping',         color: 'text-amber-400',  dot: 'bg-amber-400',  severity: 'Medium' },
  { id: 'R5', label: 'JD Quality',               color: 'text-green-400',  dot: 'bg-green-400',  severity: 'Low' },
]

export default function Sidebar({ page, setPage }) {
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [isLight, setIsLight] = useState(false)

  // Initialize theme
  useEffect(() => {
    const root = document.documentElement
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme === 'light') {
      root.classList.add('light')
      setIsLight(true)
    }
  }, [])

  const toggleTheme = () => {
    const root = document.documentElement
    if (isLight) {
      root.classList.remove('light')
      localStorage.setItem('theme', 'dark')
      setIsLight(false)
    } else {
      root.classList.add('light')
      localStorage.setItem('theme', 'light')
      setIsLight(true)
    }
  }

  const fetchNotifs = async () => {
    try {
      const res = await axios.get(`${API}/notifications`)
      setNotifications(res.data)
    } catch (e) {
      console.error('Failed to fetch notifications')
    }
  }

  const markRead = async (id) => {
    try {
      await axios.post(`${API}/notifications/${id}/read`)
      setNotifications(notifications.filter(n => n.id !== id))
    } catch (e) {
      console.error('Failed to mark read')
    }
  }

  useEffect(() => {
    fetchNotifs()
    // Poll every 10 seconds for the hackathon demo
    const interval = setInterval(fetchNotifs, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <aside className="w-64 min-h-screen flex flex-col border-r border-[var(--border)] bg-[var(--bg-card)] relative z-20 transition-colors">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--green-primary)] flex items-center justify-center shadow-glow">
              <CheckCircle2 size={18} className="text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-display font-bold text-lg leading-tight text-[var(--text-primary)]">SOVA</div>
              <div className="text-[10px] text-[var(--text-dim)] font-semibold uppercase tracking-widest">SO Validity Agent</div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button 
              onClick={toggleTheme}
              className="relative p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] rounded-lg transition-colors"
            >
              {isLight ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button 
              onClick={() => setShowNotifs(!showNotifs)}
              className="relative p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] rounded-lg transition-colors"
            >
              <Bell size={18} />
              {notifications.length > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </button>
          </div>
        </div>
        <div className="mt-3 text-[11px] text-[var(--text-dim)] font-medium">
          ITC Infotech · Hackathon 2026
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-dim)]">Menu</div>
        {[
          { id: 'validate', label: 'Dashboard',   icon: LayoutDashboard },
          { id: 'history',  label: 'Run History', icon: History },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={clsx(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
              page === id
                ? 'bg-[var(--green-primary)] text-white shadow-glow-sm'
                : 'text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]'
            )}
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </button>
        ))}

        {/* Rules */}
        <div className="px-3 mt-6 mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-dim)]">Rules Engine</div>
        {RULES.map((r, i) => (
          <div key={r.id}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors group cursor-default"
          >
            <div className={clsx('w-2 h-2 rounded-full flex-shrink-0', r.dot)} />
            <span className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors flex-1">{r.id} — {r.label}</span>
            <span className={clsx('text-[10px] font-semibold opacity-80', r.color)}>{r.severity}</span>
          </div>
        ))}
      </nav>

      {/* Footer card */}
      <div className="m-3 p-4 rounded-xl bg-[var(--bg-card-hover)] border border-[var(--border-bright)] transition-colors">
        <div className="text-xs font-display font-semibold text-[var(--text-primary)] mb-1">Agent 02 · Rule-Based</div>
        <div className="text-[11px] text-[var(--text-dim)] leading-relaxed">
          Validates SOs against 5 business rules. Advisory only — flags without modifying.
        </div>
      </div>
    </aside>

    {/* Notifications Panel */}
    {showNotifs && (
      <div className="fixed inset-y-0 left-64 w-80 bg-[var(--bg-card)] border-r border-[var(--border)] shadow-2xl z-10 flex flex-col transform transition-transform duration-300">
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--text-primary)] font-medium">
            <Bell size={16} className="text-[var(--green-primary)]" />
            Ops Alerts
          </div>
          <button onClick={() => setShowNotifs(false)} className="text-[var(--text-muted)] hover:text-white p-1 rounded-md hover:bg-[var(--bg-card-hover)]">
            <X size={16} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {notifications.length === 0 ? (
            <div className="text-center text-[var(--text-dim)] text-sm py-10">
              No new alerts.
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id} className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-3 text-sm flex flex-col gap-2 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className={clsx(
                    "text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider",
                    n.severity === 'HIGH' ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                    n.severity === 'WARNING' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                    "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  )}>
                    {n.severity}
                  </span>
                  <span className="text-[10px] text-[var(--text-dim)]">
                    {new Date(n.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
                <p className="text-[var(--text-primary)] text-xs leading-relaxed">{n.message}</p>
                <button 
                  onClick={() => markRead(n.id)}
                  className="text-[10px] font-medium text-[var(--text-muted)] hover:text-white self-start mt-1 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    )}
    </>
  )
}
