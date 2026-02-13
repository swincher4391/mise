import { useState, type KeyboardEvent } from 'react'

export const MEAL_TYPES = ['breakfast', 'lunch/dinner', 'snacks', 'dessert'] as const
export const SUB_CATEGORIES = ['crockpot', 'soups', 'kid-friendly'] as const
export const ALL_PRESET_TAGS = [...MEAL_TYPES, ...SUB_CATEGORIES] as const

interface TagManagerProps {
  tags: string[]
  onUpdate: (tags: string[]) => Promise<void>
}

export function TagManager({ tags, onUpdate }: TagManagerProps) {
  const [inputValue, setInputValue] = useState('')

  const addTag = (raw: string) => {
    const tag = raw.toLowerCase().trim()
    if (!tag || tags.includes(tag)) return
    onUpdate([...tags, tag])
    setInputValue('')
  }

  const removeTag = (tagToRemove: string) => {
    onUpdate(tags.filter((t) => t !== tagToRemove))
  }

  const togglePreset = (preset: string) => {
    if (tags.includes(preset)) {
      removeTag(preset)
    } else {
      onUpdate([...tags, preset])
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  const customTags = tags.filter((t) => !(ALL_PRESET_TAGS as readonly string[]).includes(t))

  return (
    <div className="tag-manager">
      <div className="meal-type-row">
        {MEAL_TYPES.map((mt) => (
          <button
            key={mt}
            className={`meal-type-btn${tags.includes(mt) ? ' active' : ''}`}
            onClick={() => togglePreset(mt)}
          >
            {mt}
          </button>
        ))}
      </div>
      <div className="meal-type-row">
        {SUB_CATEGORIES.map((sc) => (
          <button
            key={sc}
            className={`meal-type-btn sub-category${tags.includes(sc) ? ' active' : ''}`}
            onClick={() => togglePreset(sc)}
          >
            {sc}
          </button>
        ))}
      </div>
      <div className="tag-list">
        {customTags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button className="tag-remove" onClick={() => removeTag(tag)} aria-label={`Remove ${tag}`}>
              &times;
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={customTags.length === 0 ? 'Add tags...' : ''}
          aria-label="Add tag"
        />
      </div>
    </div>
  )
}
