type View = 'plan' | 'extract' | 'library' | 'grocery'

interface TopNavProps {
  current: View
  onChange: (view: View) => void
}

const TABS: { view: View; label: string }[] = [
  { view: 'plan', label: 'Plan' },
  { view: 'extract', label: 'Extract' },
  { view: 'library', label: 'Library' },
  { view: 'grocery', label: 'Shop' },
]

export function TopNav({ current, onChange }: TopNavProps) {
  return (
    <nav className="top-nav">
      {TABS.map((tab) => (
        <button
          key={tab.view}
          className={`top-nav-tab${current === tab.view ? ' active' : ''}`}
          onClick={() => onChange(tab.view)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
