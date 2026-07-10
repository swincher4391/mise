type View = 'plan' | 'extract' | 'library' | 'grocery'

interface TopNavProps {
  current: View
  onChange: (view: View) => void
}

// 'extract' is the default view and the core action, so it leads. Previously
// 'plan' sat leftmost, landing a first-time visitor's eye on a meal planner.
// Labelled 'Add' because 'Extract' also names a sub-tab one row below.
const TABS: { view: View; label: string }[] = [
  { view: 'extract', label: 'Add' },
  { view: 'library', label: 'Library' },
  { view: 'plan', label: 'Plan' },
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
