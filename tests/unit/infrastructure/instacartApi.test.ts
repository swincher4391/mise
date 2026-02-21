import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createShoppingList, createRecipePage } from '@infrastructure/instacart/instacartApi.ts'
import type { GroceryItem } from '@domain/models/GroceryItem.ts'
import type { Recipe } from '@domain/models/Recipe.ts'

const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('createShoppingList', () => {
  it('calls the shopping list endpoint and returns the URL', async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ url: 'https://instacart.com/store/list/123' }),
    } as unknown as Response)

    const items: GroceryItem[] = [
      { id: '1', ingredient: 'milk', displayName: 'Whole Milk', qty: 1, unit: 'gallon', category: 'dairy', checked: false, sourceRecipes: [], notes: null, optional: false },
    ]

    const result = await createShoppingList('Test List', items, [])

    expect(result.url).toBe('https://instacart.com/store/list/123')
    expect(fetchMock).toHaveBeenCalledWith('/api/grocery/instacart-shopping-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string)
    expect(body.title).toBe('Test List')
    expect(body.line_items).toHaveLength(1)
    expect(body.line_items[0].name).toBe('milk')
  })

  it('throws on non-OK response', async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ error: 'Bad request' }),
    } as unknown as Response)

    const items: GroceryItem[] = [
      { id: '1', ingredient: 'milk', displayName: 'Milk', qty: 1, unit: 'gallon', category: 'dairy', checked: false, sourceRecipes: [], notes: null, optional: false },
    ]

    await expect(createShoppingList('Test', items, [])).rejects.toThrow('Bad request')
  })
})

describe('createRecipePage', () => {
  const recipe: Recipe = {
    id: 'r1', title: 'Test Recipe', sourceUrl: 'https://example.com',
    sourceDomain: 'example.com', author: null, description: null,
    imageUrl: null, servings: null, servingsText: null,
    prepTimeMinutes: null, cookTimeMinutes: null, totalTimeMinutes: null,
    ingredients: [
      { id: 'i1', raw: '1 cup flour', qty: 1, unit: 'cup', unitCanonical: 'cup', ingredient: 'flour', prep: null, notes: null, category: 'pantry', optional: false },
    ],
    steps: [],
    nutrition: null, keywords: [], cuisines: [], categories: [], tags: [],
    notes: null, favorite: false, extractedAt: '2026-01-01',
    extractionLayer: 'json-ld', parserVersion: '1.0', schemaVersion: 1,
  }

  it('calls the recipe endpoint and returns the URL', async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ url: 'https://instacart.com/store/recipes/456' }),
    } as unknown as Response)

    const result = await createRecipePage(recipe)

    expect(result.url).toBe('https://instacart.com/store/recipes/456')
    expect(fetchMock).toHaveBeenCalledWith('/api/grocery/instacart-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string)
    expect(body.title).toBe('Test Recipe')
    expect(body.ingredients).toHaveLength(1)
  })

  it('throws on non-OK response', async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockResolvedValue({ error: 'Server error' }),
    } as unknown as Response)

    await expect(createRecipePage(recipe)).rejects.toThrow('Server error')
  })
})
