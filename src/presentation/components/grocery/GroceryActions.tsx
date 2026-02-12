interface GroceryActionsProps {
  onBack: () => void
  onShare: () => void
  onClearChecked: () => void
  shareStatus: 'idle' | 'copied' | 'shared'
}

export function GroceryActions({ onBack, onShare, onClearChecked, shareStatus }: GroceryActionsProps) {
  return (
    <div className="grocery-actions">
      <button className="nav-btn" onClick={onBack}>
        &larr; Change Recipes
      </button>
      <button className="nav-btn" onClick={onShare}>
        {shareStatus === 'copied' ? 'Copied!' : shareStatus === 'shared' ? 'Shared!' : 'Share List'}
      </button>
      <button className="nav-btn" onClick={onClearChecked}>
        Uncheck All
      </button>
    </div>
  )
}
