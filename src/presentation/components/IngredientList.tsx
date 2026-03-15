import type { ScaledIngredient } from '@application/scaler/scaleIngredients.ts'
import type { Range } from '@domain/models/Ingredient.ts'
import { formatQuantity } from '@application/scaler/formatQuantity.ts'

interface IngredientListProps {
  ingredients: ScaledIngredient[]
}

function formatQty(qty: number | Range | null): string {
  if (qty === null) return ''
  if (typeof qty === 'object' && 'min' in qty) {
    return `${formatQuantity(qty.min)}–${formatQuantity(qty.max)}`
  }
  return formatQuantity(qty)
}

export function IngredientList({ ingredients }: IngredientListProps) {
  return (
    <section className="ingredient-section">
      <h2>Ingredients</h2>
      <ul className="ingredient-list">
        {ingredients.map((ing) => (
          <li key={ing.id} className={`ingredient-item${ing.optional ? ' optional' : ''}`}>
            <span className="ing-qty">{formatQty(ing.scaledQty)}</span>
            {ing.displayUnit && <span className="ing-unit"> {ing.displayUnit}</span>}
            <span className="ing-name"> {ing.ingredient}</span>
            {ing.prep && <span className="ing-prep">, {ing.prep}</span>}
            {ing.notes && <span className="ing-notes"> ({ing.notes})</span>}
            {ing.optional && <span className="ing-optional"> (optional)</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
