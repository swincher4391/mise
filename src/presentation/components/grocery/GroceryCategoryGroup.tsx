import type { GroceryItem } from '@domain/models/GroceryItem.ts'
import { GroceryItemRow } from './GroceryItemRow.tsx'

const CATEGORY_LABELS: Record<string, string> = {
  produce: 'Produce',
  meat: 'Meat & Poultry',
  seafood: 'Seafood',
  dairy: 'Dairy',
  pantry: 'Pantry',
  spices: 'Spices',
  frozen: 'Frozen',
  beverages: 'Beverages',
}

interface GroceryCategoryGroupProps {
  category: string
  items: GroceryItem[]
  onToggle: (id: string, checked: boolean) => void
}

export function GroceryCategoryGroup({ category, items, onToggle }: GroceryCategoryGroupProps) {
  const label = CATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)
  const checkedCount = items.filter((i) => i.checked).length

  return (
    <div className="grocery-category-group">
      <div className="grocery-category-header">
        <h3>{label}</h3>
        <span className="grocery-category-count">
          {checkedCount}/{items.length}
        </span>
      </div>
      <div className="grocery-category-items">
        {items.map((item) => (
          <GroceryItemRow key={item.id} item={item} onToggle={onToggle} />
        ))}
      </div>
    </div>
  )
}
