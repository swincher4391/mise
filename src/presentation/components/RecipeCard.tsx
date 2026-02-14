import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'

interface RecipeCardProps {
  recipe: SavedRecipe
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export function RecipeCard({ recipe, onSelect, onRemove }: RecipeCardProps) {
  return (
    <div className="recipe-card" onClick={() => onSelect(recipe.id)}>
      {recipe.imageUrl ? (
        <img className="recipe-card-image" src={recipe.imageUrl} alt="" />
      ) : (
        <div className="recipe-card-image recipe-card-placeholder" />
      )}
      <div className="recipe-card-info">
        <span className="recipe-card-title">
          {recipe.favorite && <span className="card-favorite-icon">{'\u2605'} </span>}
          {recipe.title}
        </span>
        <span className="recipe-card-meta">
          {recipe.sourceDomain}
          {recipe.totalTimeMinutes && ` \u00B7 ${formatTime(recipe.totalTimeMinutes)}`}
        </span>
        {recipe.tags && recipe.tags.length > 0 && (
          <span className="recipe-card-tags">
            {recipe.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="card-tag">{tag}</span>
            ))}
          </span>
        )}
      </div>
      <button
        className="recipe-card-remove"
        onClick={(e) => { e.stopPropagation(); onRemove(recipe.id) }}
        aria-label="Remove recipe"
      >
        &times;
      </button>
    </div>
  )
}
