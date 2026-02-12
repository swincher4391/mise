import type { GroceryItem } from '@domain/models/GroceryItem.ts'
import type { ManualGroceryItem } from '@domain/models/ManualGroceryItem.ts'
import { GroceryCategoryGroup } from './GroceryCategoryGroup.tsx'
import { ManualItemInput } from './ManualItemInput.tsx'

interface GroceryListViewProps {
  items: GroceryItem[]
  manualItems: ManualGroceryItem[]
  onToggleItem: (id: string, checked: boolean) => void
  onToggleManualItem: (id: string, checked: boolean) => void
  onAddManualItem: (name: string) => void
  onRemoveManualItem: (id: string) => void
}

export function GroceryListView({
  items,
  manualItems,
  onToggleItem,
  onToggleManualItem,
  onAddManualItem,
  onRemoveManualItem,
}: GroceryListViewProps) {
  // Group items by category
  const grouped = new Map<string, GroceryItem[]>()
  const uncategorized: GroceryItem[] = []

  for (const item of items) {
    if (item.category) {
      const group = grouped.get(item.category) ?? []
      group.push(item)
      grouped.set(item.category, group)
    } else {
      uncategorized.push(item)
    }
  }

  // Maintain category order
  const categoryOrder = ['produce', 'meat', 'seafood', 'dairy', 'pantry', 'spices', 'frozen', 'beverages']
  const orderedCategories = categoryOrder.filter((c) => grouped.has(c))

  // Add any categories not in the predefined order
  for (const cat of grouped.keys()) {
    if (!orderedCategories.includes(cat)) orderedCategories.push(cat)
  }

  const totalItems = items.length + manualItems.length
  const checkedItems = items.filter((i) => i.checked).length + manualItems.filter((i) => i.checked).length

  return (
    <div className="grocery-list-view">
      <div className="grocery-progress">
        <span>{checkedItems} of {totalItems} items checked</span>
        <div className="grocery-progress-bar">
          <div
            className="grocery-progress-fill"
            style={{ width: totalItems > 0 ? `${(checkedItems / totalItems) * 100}%` : '0%' }}
          />
        </div>
      </div>

      {orderedCategories.map((cat) => (
        <GroceryCategoryGroup
          key={cat}
          category={cat}
          items={grouped.get(cat)!}
          onToggle={onToggleItem}
        />
      ))}

      {uncategorized.length > 0 && (
        <GroceryCategoryGroup
          category="uncategorized"
          items={uncategorized}
          onToggle={onToggleItem}
        />
      )}

      <div className="grocery-category-group">
        <div className="grocery-category-header">
          <h3>Custom Items</h3>
        </div>
        <div className="grocery-category-items">
          {manualItems.map((item) => (
            <label key={item.id} className={`grocery-item-row ${item.checked ? 'checked' : ''}`}>
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => onToggleManualItem(item.id, !item.checked)}
              />
              <span className="grocery-item-text">{item.name}</span>
              <button
                className="grocery-remove-btn"
                onClick={(e) => {
                  e.preventDefault()
                  onRemoveManualItem(item.id)
                }}
                title="Remove item"
              >
                &times;
              </button>
            </label>
          ))}
          <ManualItemInput onAdd={onAddManualItem} />
        </div>
      </div>
    </div>
  )
}
