import type { GroceryItem } from '@domain/models/GroceryItem.ts'
import { formatQuantity } from '@application/scaler/formatQuantity.ts'

interface GroceryItemRowProps {
  item: GroceryItem
  onToggle: (id: string, checked: boolean) => void
}

export function GroceryItemRow({ item, onToggle }: GroceryItemRowProps) {
  const qtyDisplay = item.qty !== null ? formatQuantity(item.qty) : null
  const unitDisplay = item.unit
    ? (item.qty !== null && item.qty > 1 && !item.unit.endsWith('s')
      ? item.unit + 's'
      : item.unit)
    : null

  return (
    <label className={`grocery-item-row ${item.checked ? 'checked' : ''}`}>
      <input
        type="checkbox"
        checked={item.checked}
        onChange={() => onToggle(item.id, !item.checked)}
      />
      <span className="grocery-item-text">
        {qtyDisplay && <strong>{qtyDisplay}</strong>}
        {unitDisplay && <> {unitDisplay}</>}
        {' '}{item.displayName}
        {item.optional && <span className="grocery-optional"> [optional]</span>}
        {item.notes && <span className="grocery-notes"> ({item.notes})</span>}
      </span>
      {item.sourceRecipes.length > 1 && (
        <span className="grocery-source-badges">
          {item.sourceRecipes.map((s) => (
            <span key={s.recipeId} className="grocery-source-badge" title={s.recipeTitle}>
              {s.recipeTitle.length > 15 ? s.recipeTitle.slice(0, 15) + '...' : s.recipeTitle}
            </span>
          ))}
        </span>
      )}
    </label>
  )
}
