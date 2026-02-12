import type { GroceryItem } from '@domain/models/GroceryItem.ts'
import type { ManualGroceryItem } from '@domain/models/ManualGroceryItem.ts'
import { formatQuantity } from '@application/scaler/formatQuantity.ts'

/**
 * Format a single grocery item as plain text.
 * Examples: "2 cups flour", "1/2 teaspoon salt", "garlic (to taste)"
 */
export function formatGroceryItem(item: GroceryItem): string {
  const parts: string[] = []

  if (item.qty !== null) {
    parts.push(formatQuantity(item.qty))
  }

  if (item.unit) {
    const unitDisplay = item.qty !== null && item.qty > 1 && !item.unit.endsWith('s')
      ? item.unit + 's'
      : item.unit
    parts.push(unitDisplay)
  }

  parts.push(item.displayName)

  if (item.notes) {
    parts.push(`(${item.notes})`)
  }

  if (item.optional) {
    parts.push('[optional]')
  }

  return parts.join(' ')
}

/**
 * Format an entire grocery list as plain text grouped by category.
 */
export function formatGroceryListText(
  items: GroceryItem[],
  manualItems: ManualGroceryItem[],
): string {
  const lines: string[] = []

  // Group by category
  const grouped = new Map<string, GroceryItem[]>()
  for (const item of items) {
    const cat = item.category ?? 'other'
    const group = grouped.get(cat) ?? []
    group.push(item)
    grouped.set(cat, group)
  }

  const categoryNames: Record<string, string> = {
    produce: 'Produce',
    meat: 'Meat & Poultry',
    seafood: 'Seafood',
    dairy: 'Dairy',
    pantry: 'Pantry',
    spices: 'Spices',
    frozen: 'Frozen',
    beverages: 'Beverages',
    other: 'Other',
  }

  for (const [cat, group] of grouped) {
    lines.push(`\n${categoryNames[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1)}`)
    lines.push('---')
    for (const item of group) {
      const prefix = item.checked ? '[x]' : '[ ]'
      lines.push(`${prefix} ${formatGroceryItem(item)}`)
    }
  }

  if (manualItems.length > 0) {
    lines.push('\nCustom Items')
    lines.push('---')
    for (const item of manualItems) {
      const prefix = item.checked ? '[x]' : '[ ]'
      lines.push(`${prefix} ${item.name}`)
    }
  }

  return lines.join('\n').trim()
}
