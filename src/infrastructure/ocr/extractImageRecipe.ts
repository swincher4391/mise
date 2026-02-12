export interface ImageRecipeResult {
  title: string
  ingredients: string[]
  steps: string[]
  servings: string | null
  prepTime: string | null
  cookTime: string | null
}

export async function extractImageRecipe(imageBase64: string): Promise<ImageRecipeResult> {
  const response = await fetch('/api/extract-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Server error' }))
    throw new Error(data.error ?? `Server error (${response.status})`)
  }

  const data = await response.json()

  if (data.error) {
    throw new Error(data.error)
  }

  if (!data.title || !Array.isArray(data.ingredients) || !Array.isArray(data.steps)) {
    throw new Error('Invalid recipe data returned from vision model')
  }

  return {
    title: data.title,
    ingredients: data.ingredients,
    steps: data.steps,
    servings: data.servings ?? null,
    prepTime: data.prepTime ?? null,
    cookTime: data.cookTime ?? null,
  }
}
