import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'

interface RecipeCardProps {
  recipe: SavedRecipe
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}

const PLACEHOLDER_COLORS = [
  '#2d5016', '#8b5c2a', '#5b3a6b', '#1a5276', '#6b3a3a',
  '#3a6b5b', '#6b5a3a', '#3a4f6b', '#6b3a5a', '#4a6b3a',
]

function getInitials(title: string): string {
  const words = title.trim().split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return title.slice(0, 2).toUpperCase()
}

function getTitleColor(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0
  return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length]
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
        <div className="recipe-card-image recipe-card-placeholder" style={{ background: getTitleColor(recipe.title) }}>
          <span className="recipe-card-initials">{getInitials(recipe.title)}</span>
        </div>
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
