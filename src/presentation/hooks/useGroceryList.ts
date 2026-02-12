import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@infrastructure/db/database.ts'
import type { GroceryList } from '@domain/models/GroceryList.ts'

/**
 * Live query hook for the most recently updated grocery list.
 */
export function useGroceryList(): { list: GroceryList | null; isLoading: boolean } {
  const list = useLiveQuery(
    () => db.groceryLists.orderBy('updatedAt').reverse().first(),
    [],
  )

  return {
    list: list ?? null,
    isLoading: list === undefined,
  }
}

/**
 * Live query hook for a specific grocery list by ID.
 */
export function useGroceryListById(id: string | null): GroceryList | null {
  const list = useLiveQuery(
    () => {
      if (!id) return undefined
      return db.groceryLists.get(id)
    },
    [id],
  )

  return list ?? null
}
