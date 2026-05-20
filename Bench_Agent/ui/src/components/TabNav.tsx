interface Props {
  active: string
  onChange: (tab: string) => void
}

const TABS = [
  {
    id: 'summary',
    label: 'Bench Summary',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <rect x="1" y="1" width="6" height="6" rx="1" />
        <rect x="9" y="1" width="6" height="6" rx="1" />
        <rect x="1" y="9" width="6" height="6" rx="1" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
      </svg>
    ),
  },
  {
    id: 'forecast',
    label: '30 / 60 / 90-Day Forecast',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <polyline points="1,12 5,7 9,9 15,3" />
        <polyline points="10,3 15,3 15,8" />
      </svg>
    ),
  },
  {
    id: 'alerts',
    label: 'Threshold Alerts',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <path d="M8 2L1.5 13.5h13L8 2z" />
        <line x1="8" y1="7" x2="8" y2="10" />
        <circle cx="8" cy="12.5" r=".6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'freeze',
    label: 'Hiring Freeze',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <line x1="8" y1="1" x2="8" y2="15" />
        <line x1="1" y1="8" x2="15" y2="8" />
        <line x1="3.17" y1="3.17" x2="12.83" y2="12.83" />
        <line x1="12.83" y1="3.17" x2="3.17" y2="12.83" />
      </svg>
    ),
  },
  {
    id: 'actions',
    label: 'Recommended Actions',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <path d="M13 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z" />
        <polyline points="5 8 7 10 11 6" />
      </svg>
    ),
  },
  {
    id: 'deployment',
    label: 'Deployment Matches',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <circle cx="5" cy="5" r="2" />
        <circle cx="11" cy="11" r="2" />
        <line x1="7" y1="5" x2="14" y2="5" />
        <line x1="2" y1="11" x2="9" y2="11" />
        <line x1="7" y1="5" x2="9" y2="11" />
      </svg>
    ),
  },
  {
    id: 'skillgap',
    label: 'Skill Gap',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <rect x="1" y="10" width="3" height="5" />
        <rect x="6" y="6" width="3" height="9" />
        <rect x="11" y="2" width="3" height="13" />
        <line x1="1" y1="8" x2="14" y2="3" strokeDasharray="2 1" />
      </svg>
    ),
  },
  {
    id: 'skilliq',
    label: 'Skill Intelligence',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <circle cx="8" cy="8" r="6.5" />
        <line x1="8" y1="5" x2="8" y2="8.5" />
        <circle cx="8" cy="11" r=".6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: 'gradeiq',
    label: 'Grade Intelligence',
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
        <rect x="1" y="1" width="14" height="14" rx="2" />
        <line x1="1" y1="6" x2="15" y2="6" />
        <line x1="6" y1="6" x2="6" y2="15" />
      </svg>
    ),
  },
]

export default function TabNav({ active, onChange }: Props) {
  const handleClick = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget
    const rect = btn.getBoundingClientRect()
    const ripple = document.createElement('span')
    ripple.className = 'ripple-el'
    ripple.style.left = `${e.clientX - rect.left}px`
    ripple.style.top  = `${e.clientY - rect.top}px`
    btn.appendChild(ripple)
    ripple.addEventListener('animationend', () => ripple.remove())
    onChange(id)
  }

  return (
    <nav className="tab-nav" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={`tab-btn${active === t.id ? ' active' : ''}`}
          onClick={(e) => handleClick(t.id, e)}
        >
          <span className="tab-icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  )
}