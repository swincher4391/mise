import type { GroceryList } from '@domain/models/GroceryList.ts'
import type { ManualGroceryItem } from '@domain/models/ManualGroceryItem.ts'
import { db } from './database.ts'

export async function saveGroceryList(list: GroceryList): Promise<void> {
  await db.groceryLists.put({ ...list, updatedAt: new Date().toISOString() })
}

export async function getLatestGroceryList(): Promise<GroceryList | undefined> {
  return db.groceryLists.orderBy('updatedAt').reverse().first()
}

export async function getGroceryListById(id: string): Promise<GroceryList | undefined> {
  return db.groceryLists.get(id)
}

export async function deleteGroceryList(id: string): Promise<void> {
  await db.groceryLists.delete(id)
}

export async function updateItemChecked(
  listId: string,
  itemId: string,
  checked: boolean,
): Promise<void> {
  const list = await db.groceryLists.get(listId)
  if (!list) return

  const item = list.items.find((i) => i.id === itemId)
  if (item) {
    item.checked = checked
    await db.groceryLists.put({ ...list, updatedAt: new Date().toISOString() })
  }
}

export async function updateManualItemChecked(
  listId: string,
  itemId: string,
  checked: boolean,
): Promise<void> {
  const list = await db.groceryLists.get(listId)
  if (!list) return

  const item = list.manualItems.find((i) => i.id === itemId)
  if (item) {
    item.checked = checked
    await db.groceryLists.put({ ...list, updatedAt: new Date().toISOString() })
  }
}

export async function addManualItem(
  listId: string,
  item: ManualGroceryItem,
): Promise<void> {
  const list = await db.groceryLists.get(listId)
  if (!list) return

  list.manualItems.push(item)
  await db.groceryLists.put({ ...list, updatedAt: new Date().toISOString() })
}

export async function removeManualItem(
  listId: string,
  itemId: string,
): Promise<void> {
  const list = await db.groceryLists.get(listId)
  if (!list) return

  list.manualItems = list.manualItems.filter((i) => i.id !== itemId)
  await db.groceryLists.put({ ...list, updatedAt: new Date().toISOString() })
}

export async function clearCheckedItems(listId: string): Promise<void> {
  const list = await db.groceryLists.get(listId)
  if (!list) return

  for (const item of list.items) {
    item.checked = false
  }
  for (const item of list.manualItems) {
    item.checked = false
  }
  await db.groceryLists.put({ ...list, updatedAt: new Date().toISOString() })
}
