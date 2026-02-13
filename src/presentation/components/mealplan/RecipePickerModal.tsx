import { useState } from 'react'
import type { SavedRecipe } from '@domain/models/SavedRecipe.ts'

interface RecipePickerModalProps {
  recipes: SavedRecipe[]
  onPick: (recipeId: string) => void
  onClose: () => void
}

export function RecipePickerModal({ recipes, onPick, onClose }: RecipePickerModalProps) {
  const [search, setSearch] = useState('')

  const filtered = recipes.filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="recipe-picker-overlay" onClick={onClose}>
      <div className="recipe-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="recipe-picker-header">
          <h2>Choose a Recipe</h2>
          <button className="recipe-picker-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="recipe-picker-search">
          <input
            type="text"
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="recipe-picker-list">
          {filtered.length === 0 && (
            <p className="recipe-picker-empty">
              {recipes.length === 0 ? 'No recipes saved yet.' : 'No recipes match your search.'}
            </p>
          )}
          {filtered.map((recipe) => (
            <button
              key={recipe.id}
              className="recipe-picker-item"
              onClick={() => onPick(recipe.id)}
            >
              {recipe.imageUrl && (
                <img
                  src={recipe.imageUrl}
                  alt=""
                  className="recipe-picker-thumb"
                />
              )}
              <div className="recipe-picker-item-info">
                <span className="recipe-picker-item-title">{recipe.title}</span>
                {recipe.servings && (
                  <span className="recipe-picker-item-meta">
                    {recipe.servings} servings
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
