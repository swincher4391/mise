interface GroceryActionsProps {
  onBack: () => void
  onShare: () => void
  onClearChecked: () => void
  onShopInstacart: () => void
  shopLoading: boolean
  shareStatus: 'idle' | 'copied' | 'shared'
}

export function GroceryActions({ onBack, onShare, onClearChecked, onShopInstacart, shopLoading, shareStatus }: GroceryActionsProps) {
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
      <button
        className="nav-btn grocery-nav-btn"
        onClick={onShopInstacart}
        disabled={shopLoading}
        style={{ backgroundColor: '#003D29', color: '#FAF1E5', border: 'none' }}
      >
        {shopLoading ? 'Loading...' : 'Shop on Instacart'}
      </button>
    </div>
  )
}
