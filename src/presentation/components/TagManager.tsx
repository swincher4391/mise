import { useState, type KeyboardEvent } from 'react'

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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(inputValue)
    } else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  return (
    <div className="tag-manager">
      <div className="tag-list">
        {tags.map((tag) => (
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
          placeholder={tags.length === 0 ? 'Add tags...' : ''}
          aria-label="Add tag"
        />
      </div>
    </div>
  )
}
