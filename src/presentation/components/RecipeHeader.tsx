import type { Recipe } from '@domain/models/Recipe.ts'

interface RecipeHeaderProps {
  recipe: Recipe
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`
}

export function RecipeHeader({ recipe }: RecipeHeaderProps) {
  return (
    <header className="recipe-header">
      {recipe.imageUrl && (
        <img
          className="recipe-image"
          src={recipe.imageUrl}
          alt={recipe.title}
          loading="lazy"
        />
      )}
      <h1 className="recipe-title">{recipe.title}</h1>
      {recipe.author && (
        <p className="recipe-author">
          by {recipe.author}
        </p>
      )}
      <a
        className="recipe-source"
        href={recipe.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {recipe.sourceDomain}
      </a>
      {recipe.description && (
        <p className="recipe-description">{recipe.description}</p>
      )}
      <div className="recipe-times">
        {recipe.prepTimeMinutes && (
          <span className="time-badge">
            <strong>Prep:</strong> {formatTime(recipe.prepTimeMinutes)}
          </span>
        )}
        {recipe.cookTimeMinutes && (
          <span className="time-badge">
            <strong>Cook:</strong> {formatTime(recipe.cookTimeMinutes)}
          </span>
        )}
        {recipe.totalTimeMinutes && (
          <span className="time-badge">
            <strong>Total:</strong> {formatTime(recipe.totalTimeMinutes)}
          </span>
        )}
      </div>
    </header>
  )
}
