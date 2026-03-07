import { describe, it, expect } from 'vitest'
import { isInstructionStep } from '@application/extraction/normalizeRecipe.ts'
import { normalizeRecipe } from '@application/extraction/normalizeRecipe.ts'

describe('isInstructionStep', () => {
  it('passes cooking imperatives', () => {
    expect(isInstructionStep('Bring broth to a boil')).toBe(true)
    expect(isInstructionStep('Preheat oven to 350°F')).toBe(true)
    expect(isInstructionStep('Stir in the garlic and cook for 2 minutes')).toBe(true)
    expect(isInstructionStep('Let sit for 10 minutes')).toBe(true)
  })

  it('passes temporal leads', () => {
    expect(isInstructionStep('When broth is thickened, fold in cheese')).toBe(true)
    expect(isInstructionStep('Once boiling, reduce heat')).toBe(true)
    expect(isInstructionStep('After 5 minutes, flip the chicken')).toBe(true)
  })

  it('filters commentary and notes', () => {
    expect(isInstructionStep('Just want to note that this works great')).toBe(false)
    expect(isInstructionStep('I recommend serving with rice')).toBe(false)
    expect(isInstructionStep('This recipe was adapted from grandma')).toBe(false)
    expect(isInstructionStep('Note: you can substitute almond milk')).toBe(false)
  })

  it('filters attribution lines', () => {
    expect(isInstructionStep('Adapted from Julia Child')).toBe(false)
    expect(isInstructionStep('Recipe by Chef John')).toBe(false)
    expect(isInstructionStep('Originally published in 2020')).toBe(false)
    expect(isInstructionStep('Source: NYT Cooking')).toBe(false)
    expect(isInstructionStep('Photo credit: Jane Doe')).toBe(false)
  })

  it('filters short/empty text', () => {
    expect(isInstructionStep('')).toBe(false)
    expect(isInstructionStep('   ')).toBe(false)
    expect(isInstructionStep('Ok')).toBe(false)
  })

  it('passes "Serve immediately" but filters plain "Serves 4"', () => {
    expect(isInstructionStep('Serve immediately with fresh herbs')).toBe(true)
    expect(isInstructionStep('Serves 4')).toBe(false)
  })
})

describe('sentence splitting for single-string blobs', () => {
  it('splits a single blob string into individual steps', () => {
    const raw = {
      name: 'Blob Recipe',
      recipeIngredient: ['1 cup flour'],
      recipeInstructions: 'Preheat oven to 350°F. Mix dry ingredients. Bake for 25 minutes.',
    }

    const recipe = normalizeRecipe(raw, 'https://example.com', '')
    expect(recipe.steps).toHaveLength(3)
    expect(recipe.steps[0].text).toBe('Preheat oven to 350°F.')
    expect(recipe.steps[1].text).toBe('Mix dry ingredients.')
    expect(recipe.steps[2].text).toBe('Bake for 25 minutes.')
  })

  it('splits a single-element array blob into sentences', () => {
    const raw = {
      name: 'Blob Recipe',
      recipeIngredient: ['1 cup flour'],
      recipeInstructions: [
        'Preheat oven to 350°F. Mix dry ingredients. Bake for 25 minutes.',
      ],
    }

    const recipe = normalizeRecipe(raw, 'https://example.com', '')
    expect(recipe.steps).toHaveLength(3)
  })

  it('does NOT split multi-element string arrays', () => {
    const raw = {
      name: 'Normal Recipe',
      recipeIngredient: ['1 cup flour'],
      recipeInstructions: [
        'Preheat oven to 350°F. Let it warm up.',
        'Mix dry ingredients. Stir well.',
      ],
    }

    const recipe = normalizeRecipe(raw, 'https://example.com', '')
    expect(recipe.steps).toHaveLength(2)
    expect(recipe.steps[0].text).toBe('Preheat oven to 350°F. Let it warm up.')
  })

  it('filters commentary from split blob and renumbers', () => {
    const raw = {
      name: 'Blob Recipe',
      recipeIngredient: ['1 cup flour'],
      recipeInstructions: 'Preheat oven to 350°F. I recommend using convection. Bake for 25 minutes.',
    }

    const recipe = normalizeRecipe(raw, 'https://example.com', '')
    expect(recipe.steps).toHaveLength(2)
    expect(recipe.steps[0].order).toBe(1)
    expect(recipe.steps[1].order).toBe(2)
  })
})

describe('normalizeSteps filtering', () => {
  it('filters non-instruction steps and renumbers', () => {
    const raw = {
      name: 'Test Recipe',
      recipeIngredient: ['1 cup flour'],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Preheat oven to 350°F.' },
        { '@type': 'HowToStep', text: 'Mix dry ingredients.' },
        { '@type': 'HowToStep', text: 'Just want to note this is great.' },
        { '@type': 'HowToStep', text: 'Bake for 25 minutes.' },
      ],
    }

    const recipe = normalizeRecipe(raw, 'https://example.com', '')
    expect(recipe.steps).toHaveLength(3)
    expect(recipe.steps[0].text).toBe('Preheat oven to 350°F.')
    expect(recipe.steps[0].order).toBe(1)
    expect(recipe.steps[1].text).toBe('Mix dry ingredients.')
    expect(recipe.steps[1].order).toBe(2)
    expect(recipe.steps[2].text).toBe('Bake for 25 minutes.')
    expect(recipe.steps[2].order).toBe(3)
  })
})
