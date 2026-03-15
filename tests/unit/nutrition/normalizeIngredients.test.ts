import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeIngredients, buildNormalizedNameMap } from '../../../src/application/nutrition/normalizeIngredients.ts'
import type { Ingredient } from '../../../src/domain/models/Ingredient.ts'
import type { NormalizedIngredient } from '../../../src/domain/models/RecipeNutrition.ts'

function makeIngredient(overrides: Partial<Ingredient> & { ingredient: string; raw: string }): Ingredient {
  return {
    id: `ing_${Math.random().toString(36).slice(2)}`,
    qty: 1,
    unit: null,
    unitCanonical: null,
    prep: null,
    notes: null,
    category: null,
    optional: false,
    ...overrides,
  }
}

describe('normalizeIngredients', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null for empty ingredients', async () => {
    const result = await normalizeIngredients([])
    expect(result).toBeNull()
  })

  it('returns normalized results on successful API call', async () => {
    const mockResponse: { normalized: NormalizedIngredient[] } = {
      normalized: [
        { raw: '2 cups all-purpose flour', name: 'all-purpose flour', action: 'MATCH' },
        { raw: '1 tsp salt', name: 'salt', action: 'SKIP' },
      ],
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const ingredients = [
      makeIngredient({ raw: '2 cups all-purpose flour', ingredient: 'all-purpose flour' }),
      makeIngredient({ raw: '1 tsp salt', ingredient: 'salt' }),
    ]

    const result = await normalizeIngredients(ingredients)
    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
    expect(result![0].name).toBe('all-purpose flour')
    expect(result![0].action).toBe('MATCH')
    expect(result![1].name).toBe('salt')
    expect(result![1].action).toBe('SKIP')
  })

  it('sends correct request body with mode: normalize', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ normalized: [{ raw: 'flour', name: 'flour', action: 'MATCH' }] }),
    } as Response)

    const ingredients = [makeIngredient({ raw: 'flour', ingredient: 'flour' })]
    await normalizeIngredients(ingredients)

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/recipe-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'normalize', ingredients: ['flour'] }),
    })
  })

  it('returns null on API error (graceful fallback)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as Response)

    const ingredients = [makeIngredient({ raw: 'flour', ingredient: 'flour' })]
    const result = await normalizeIngredients(ingredients)
    expect(result).toBeNull()
  })

  it('returns null on network error (graceful fallback)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

    const ingredients = [makeIngredient({ raw: 'flour', ingredient: 'flour' })]
    const result = await normalizeIngredients(ingredients)
    expect(result).toBeNull()
  })

  it('returns null when response has no normalized array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ something_else: true }),
    } as Response)

    const ingredients = [makeIngredient({ raw: 'flour', ingredient: 'flour' })]
    const result = await normalizeIngredients(ingredients)
    expect(result).toBeNull()
  })

  it('filters out invalid entries from response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        normalized: [
          { raw: 'flour', name: 'flour', action: 'MATCH' },
          { raw: 'bad', action: 'INVALID_ACTION' }, // missing name, invalid action
          { name: 'no-raw' }, // missing raw
        ],
      }),
    } as Response)

    const ingredients = [
      makeIngredient({ raw: 'flour', ingredient: 'flour' }),
      makeIngredient({ raw: 'bad', ingredient: 'bad' }),
    ]
    const result = await normalizeIngredients(ingredients)
    expect(result).toHaveLength(1)
    expect(result![0].name).toBe('flour')
  })

  it('preserves ESTIMATE_QUANTITY with defaultGrams', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        normalized: [
          { raw: 'sugar to taste', name: 'sugar', action: 'ESTIMATE_QUANTITY', defaultGrams: 10 },
        ],
      }),
    } as Response)

    const ingredients = [makeIngredient({ raw: 'sugar to taste', ingredient: 'sugar', qty: null })]
    const result = await normalizeIngredients(ingredients)
    expect(result).toHaveLength(1)
    expect(result![0].action).toBe('ESTIMATE_QUANTITY')
    expect(result![0].defaultGrams).toBe(10)
  })
})

describe('buildNormalizedNameMap', () => {
  it('returns empty map when normalized is null', () => {
    const ingredients = [makeIngredient({ raw: 'flour', ingredient: 'flour' })]
    const map = buildNormalizedNameMap(ingredients, null)
    expect(Object.keys(map)).toHaveLength(0)
  })

  it('maps by index position (not raw string matching)', () => {
    const ingredients = [
      makeIngredient({ raw: '2 cups flour', ingredient: 'flour' }),
      makeIngredient({ raw: '1 tsp salt', ingredient: 'salt' }),
    ]
    // LLM may return slightly different raw strings
    const normalized: NormalizedIngredient[] = [
      { raw: '2 cups flour, sifted', name: 'all-purpose flour', action: 'MATCH' },
      { raw: '1 tsp salt to taste', name: 'salt', action: 'SKIP' },
    ]

    const map = buildNormalizedNameMap(ingredients, normalized)
    // Should map by index: ingredients[0].raw → normalized[0]
    expect(map['2 cups flour'].name).toBe('all-purpose flour')
    expect(map['1 tsp salt'].action).toBe('SKIP')
  })
})
