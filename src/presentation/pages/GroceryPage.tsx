import { useState, useCallback } from 'react'
import { useSavedRecipes } from '@presentation/hooks/useSavedRecipes.ts'
import { useGroceryList } from '@presentation/hooks/useGroceryList.ts'
import { aggregateIngredients } from '@application/grocery/aggregateIngredients.ts'
import { shareGroceryList } from '@application/grocery/shareGroceryList.ts'
import {
  saveGroceryList,
  updateItemChecked,
  updateManualItemChecked,
  addManualItem,
  removeManualItem,
  clearCheckedItems,
} from '@infrastructure/db/groceryRepository.ts'
import { createShoppingList } from '@infrastructure/instacart/instacartApi.ts'
import type { SelectedRecipe } from '@domain/models/GroceryList.ts'
import type { GroceryList } from '@domain/models/GroceryList.ts'
import { RecipeSelector } from '@presentation/components/grocery/RecipeSelector.tsx'
import { GroceryListView } from '@presentation/components/grocery/GroceryListView.tsx'
import { GroceryActions } from '@presentation/components/grocery/GroceryActions.tsx'

type Phase = 'select' | 'list'

interface GroceryPageProps {
  onNavigateToLibrary: () => void
}

export function GroceryPage({ onNavigateToLibrary }: GroceryPageProps) {
  const { recipes } = useSavedRecipes()
  const { list: existingList } = useGroceryList()

  // Resume existing list if available
  const [phase, setPhase] = useState<Phase>(existingList ? 'list' : 'select')
  const [activeListId, setActiveListId] = useState<string | null>(existingList?.id ?? null)
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'shared'>('idle')
  const [shopLoading, setShopLoading] = useState(false)

  // Re-derive phase when existing list loads
  if (existingList && !activeListId) {
    setActiveListId(existingList.id)
    setPhase('list')
  }

  const currentList = existingList?.id === activeListId ? existingList : null

  const handleGenerate = useCallback(async (selected: SelectedRecipe[]) => {
    const items = aggregateIngredients(
      recipes,
      selected,
    )

    const now = new Date().toISOString()
    const list: GroceryList = {
      id: `gl-${Date.now()}`,
      name: `Grocery List`,
      selectedRecipes: selected,
      items,
      manualItems: [],
      createdAt: now,
      updatedAt: now,
    }

    await saveGroceryList(list)
    setActiveListId(list.id)
    setPhase('list')
  }, [recipes])

  const handleToggleItem = useCallback(async (itemId: string, checked: boolean) => {
    if (!activeListId) return
    await updateItemChecked(activeListId, itemId, checked)
  }, [activeListId])

  const handleToggleManualItem = useCallback(async (itemId: string, checked: boolean) => {
    if (!activeListId) return
    await updateManualItemChecked(activeListId, itemId, checked)
  }, [activeListId])

  const handleAddManualItem = useCallback(async (name: string) => {
    if (!activeListId) return
    await addManualItem(activeListId, {
      id: `manual-${Date.now()}`,
      name,
      checked: false,
    })
  }, [activeListId])

  const handleRemoveManualItem = useCallback(async (itemId: string) => {
    if (!activeListId) return
    await removeManualItem(activeListId, itemId)
  }, [activeListId])

  const handleClearChecked = useCallback(async () => {
    if (!activeListId) return
    await clearCheckedItems(activeListId)
  }, [activeListId])

  const handleShare = useCallback(async () => {
    if (!currentList) return
    const success = await shareGroceryList(
      currentList.name,
      currentList.items,
      currentList.manualItems,
    )
    if (success) {
      setShareStatus('share' in navigator ? 'shared' : 'copied')
      setTimeout(() => setShareStatus('idle'), 2000)
    }
  }, [currentList])

  const handleBack = useCallback(() => {
    setPhase('select')
    setActiveListId(null)
  }, [])

  const handleShopInstacart = useCallback(async () => {
    if (!currentList) return
    setShopLoading(true)
    try {
      const uncheckedItems = currentList.items.filter((i) => !i.checked)
      const uncheckedManual = currentList.manualItems.filter((i) => !i.checked)
      const result = await createShoppingList(
        currentList.name,
        uncheckedItems,
        uncheckedManual,
      )
      window.open(result.url, '_blank', 'noopener')
    } catch (err) {
      console.error('Instacart error:', err)
      alert(err instanceof Error ? err.message : 'Failed to create Instacart shopping list')
    } finally {
      setShopLoading(false)
    }
  }, [currentList])

  return (
    <main className="extract-page">
      <div className="page-header">
        <h1 className="app-title">Mise</h1>
        <p className="app-tagline">Grocery List</p>
      </div>
      <div className="app-nav">
        <button className="nav-btn" onClick={onNavigateToLibrary}>
          &larr; Library
        </button>
      </div>

      {phase === 'select' && (
        <RecipeSelector recipes={recipes} onGenerate={handleGenerate} />
      )}

      {phase === 'list' && currentList && (
        <>
          <GroceryActions
            onBack={handleBack}
            onShare={handleShare}
            onClearChecked={handleClearChecked}
            onShopInstacart={handleShopInstacart}
            shopLoading={shopLoading}
            shareStatus={shareStatus}
          />
          <GroceryListView
            items={currentList.items}
            manualItems={currentList.manualItems}
            onToggleItem={handleToggleItem}
            onToggleManualItem={handleToggleManualItem}
            onAddManualItem={handleAddManualItem}
            onRemoveManualItem={handleRemoveManualItem}
          />
        </>
      )}
    </main>
  )
}
