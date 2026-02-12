import type { GroceryItem } from '@domain/models/GroceryItem.ts'
import type { ManualGroceryItem } from '@domain/models/ManualGroceryItem.ts'
import { formatGroceryListText } from './formatGroceryItem.ts'

/**
 * Share a grocery list using the Web Share API with clipboard fallback.
 * Returns true if share/copy succeeded.
 */
export async function shareGroceryList(
  name: string,
  items: GroceryItem[],
  manualItems: ManualGroceryItem[],
): Promise<boolean> {
  const text = formatGroceryListText(items, manualItems)

  // Try Web Share API first (mobile-friendly)
  if (navigator.share) {
    try {
      await navigator.share({ title: name, text })
      return true
    } catch (err) {
      // User cancelled or share failed — fall through to clipboard
      if ((err as DOMException)?.name === 'AbortError') return false
    }
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
