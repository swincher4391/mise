interface GroceryActionsProps {
  onBack: () => void
  onShare: () => void
  onClearChecked: () => void
  onPriceCheck: () => void
  shareStatus: 'idle' | 'copied' | 'shared'
}

export function GroceryActions({ onBack, onShare, onClearChecked, onPriceCheck, shareStatus }: GroceryActionsProps) {
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
      <button className="nav-btn grocery-nav-btn" onClick={onPriceCheck}>
        Price Check
      </button>
    </div>
  )
}
