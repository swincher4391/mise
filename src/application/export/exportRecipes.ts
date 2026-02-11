import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'

interface ExportData {
  version: 1
  exportedAt: string
  recipeCount: number
  recipes: SavedRecipe[]
}

export function buildExportData(recipes: SavedRecipe[]): ExportData {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    recipeCount: recipes.length,
    recipes,
  }
}

export function downloadJson(data: ExportData, filename?: string): void {
  const name = filename ?? `mise-recipes-${new Date().toISOString().slice(0, 10)}.json`
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadSingleRecipe(recipe: SavedRecipe): void {
  const data = buildExportData([recipe])
  const slug = recipe.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
  downloadJson(data, `mise-${slug}.json`)
}
