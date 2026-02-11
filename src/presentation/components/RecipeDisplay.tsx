import { useState, useMemo } from 'react'
import type { Recipe } from '@domain/models/Recipe.ts'
import { scaleIngredients } from '@application/scaler/scaleIngredients.ts'
import { RecipeHeader } from './RecipeHeader.tsx'
import { ServingScaler } from './ServingScaler.tsx'
import { IngredientList } from './IngredientList.tsx'
import { StepList } from './StepList.tsx'

interface RecipeDisplayProps {
  recipe: Recipe
}

export function RecipeDisplay({ recipe }: RecipeDisplayProps) {
  const [currentServings, setCurrentServings] = useState(recipe.servings ?? 4)

  const scaledIngredients = useMemo(
    () => scaleIngredients(recipe.ingredients, recipe.servings ?? currentServings, currentServings),
    [recipe.ingredients, recipe.servings, currentServings],
  )

  return (
    <article className="recipe-display">
      <RecipeHeader recipe={recipe} />
      {recipe.servings && (
        <ServingScaler
          currentServings={currentServings}
          onChange={setCurrentServings}
        />
      )}
      <IngredientList ingredients={scaledIngredients} />
      <StepList steps={recipe.steps} />
    </article>
  )
}
