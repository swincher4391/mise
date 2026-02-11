import type { ScaledIngredient } from '@application/scaler/scaleIngredients.ts'
import type { Range } from '@domain/models/Ingredient.ts'
import { formatQuantity } from '@application/scaler/formatQuantity.ts'

interface CookingIngredientSidebarProps {
  ingredients: ScaledIngredient[]
  checkedIds: Set<string>
  onToggle: (id: string) => void
  onClose: () => void
}

function formatQty(qty: number | Range | null): string {
  if (qty === null) return ''
  if (typeof qty === 'object' && 'min' in qty) {
    return `${formatQuantity(qty.min)}\u2013${formatQuantity(qty.max)}`
  }
  return formatQuantity(qty)
}

export function CookingIngredientSidebar({
  ingredients,
  checkedIds,
  onToggle,
  onClose,
}: CookingIngredientSidebarProps) {
  return (
    <aside
      className="cooking-sidebar"
      role="complementary"
      aria-label="Ingredients checklist"
    >
      <div className="cooking-sidebar-header">
        <h2>Ingredients</h2>
        <button
          className="cooking-sidebar-close"
          onClick={onClose}
          aria-label="Close ingredients"
        >
          &times;
        </button>
      </div>
      <ul className="cooking-sidebar-list">
        {ingredients.map((ing) => {
          const checked = checkedIds.has(ing.id)
          return (
            <li key={ing.id} className="cooking-sidebar-item">
              <label className={`cooking-sidebar-label ${checked ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(ing.id)}
                  className="cooking-sidebar-checkbox"
                />
                <span className={checked ? 'cooking-sidebar-strikethrough' : ''}>
                  {formatQty(ing.scaledQty)}
                  {ing.displayUnit ? ` ${ing.displayUnit}` : ''}
                  {' '}{ing.ingredient}
                  {ing.prep ? `, ${ing.prep}` : ''}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
