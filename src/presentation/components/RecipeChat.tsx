import { useState, useEffect, useRef, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@infrastructure/db/database.ts'
import { useRecipeChat } from '@presentation/hooks/useRecipeChat.ts'
import { createManualRecipe } from '@application/extraction/createManualRecipe.ts'
import type { Recipe } from '@domain/models/Recipe.ts'
import type { PendingRecipe } from '@presentation/hooks/useRecipeChat.ts'

interface RecipeChatProps {
  onRecipeReady: (recipe: Recipe) => void
  initialPrompt?: string
}

function parseTimeMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null
  const match = timeStr.match(/(\d+)/)
  return match ? parseInt(match[1], 10) : null
}

function buildRecipe(pending: PendingRecipe): Recipe {
  const recipe = createManualRecipe({
    title: pending.title,
    ingredientLines: pending.ingredients,
    stepLines: pending.steps,
  })
  recipe.extractionLayer = 'chat'
  recipe.servingsText = pending.servings
  recipe.servings = pending.servings ? parseInt(pending.servings, 10) || null : null
  recipe.prepTimeMinutes = parseTimeMinutes(pending.prepTime)
  recipe.cookTimeMinutes = parseTimeMinutes(pending.cookTime)
  if (recipe.prepTimeMinutes != null && recipe.cookTimeMinutes != null) {
    recipe.totalTimeMinutes = recipe.prepTimeMinutes + recipe.cookTimeMinutes
  }
  recipe.imageUrl = pending.imageUrl
  return recipe
}

export function RecipeChat({ onRecipeReady, initialPrompt }: RecipeChatProps) {
  const { messages, isStreaming, error, pendingRecipe, sendMessage, requestFinalize, dismissRecipe } = useRecipeChat()
  const [input, setInput] = useState('')
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteFilter, setAutocompleteFilter] = useState('')
  const [autocompleteIndex, setAutocompleteIndex] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const initialPromptSent = useRef(false)

  const allRecipes = useLiveQuery(() => db.recipes.orderBy('title').toArray(), []) ?? []

  const filteredRecipes = useMemo(() => {
    if (!showAutocomplete) return []
    const q = autocompleteFilter.toLowerCase()
    return allRecipes
      .filter(r => r.title.toLowerCase().includes(q))
      .slice(0, 6)
  }, [showAutocomplete, autocompleteFilter, allRecipes])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (initialPrompt && !initialPromptSent.current && messages.length === 0) {
      initialPromptSent.current = true
      sendMessage(initialPrompt)
    }
  }, [initialPrompt, messages.length, sendMessage])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInput(val)

    const cursor = e.target.selectionStart ?? val.length
    const before = val.slice(0, cursor)
    const atIdx = before.lastIndexOf('@')

    if (atIdx !== -1 && (atIdx === 0 || before[atIdx - 1] === ' ')) {
      const filter = before.slice(atIdx + 1)
      setAutocompleteFilter(filter)
      setShowAutocomplete(true)
      setAutocompleteIndex(0)
    } else {
      setShowAutocomplete(false)
    }
  }

  const handleSelectRecipe = (recipe: Recipe) => {
    const cursor = inputRef.current?.selectionStart ?? input.length
    const before = input.slice(0, cursor)
    const atIdx = before.lastIndexOf('@')
    const after = input.slice(cursor)

    const newInput = before.slice(0, atIdx) + '@' + recipe.title + ' ' + after
    setInput(newInput)
    setShowAutocomplete(false)

    requestAnimationFrame(() => {
      const newCursor = atIdx + 1 + recipe.title.length + 1
      inputRef.current?.setSelectionRange(newCursor, newCursor)
      inputRef.current?.focus()
    })
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showAutocomplete || filteredRecipes.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAutocompleteIndex(i => (i + 1) % filteredRecipes.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAutocompleteIndex(i => (i - 1 + filteredRecipes.length) % filteredRecipes.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      handleSelectRecipe(filteredRecipes[autocompleteIndex])
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    sendMessage(input)
    setInput('')
    setShowAutocomplete(false)
  }

  const handleSaveRecipe = () => {
    if (!pendingRecipe) return
    const recipe = buildRecipe(pendingRecipe)
    onRecipeReady(recipe)
  }

  // Strip recipe-json / json blocks from displayed content
  const displayContent = (content: string) => {
    return content.replace(/```(?:recipe-json|json)[\s\S]*?```/g, '').trim()
  }

  return (
    <div className="recipe-chat">
      <div className="recipe-chat-messages">
        {messages.length === 0 && !isStreaming && (
          <div className="recipe-chat-empty">
            <p>Describe a dish and I'll help you build a recipe.</p>
            <p className="recipe-chat-examples">Try: "quick chicken stir fry for 2" or "a vegetarian pasta bake"</p>
          </div>
        )}
        {messages.map((msg, idx) => {
          // Hide the assistant message that only contains the recipe-json block
          if (msg.role === 'assistant' && pendingRecipe) {
            const stripped = displayContent(msg.content)
            if (!stripped) return null
          }
          return (
            <div key={idx} className={`recipe-chat-bubble ${msg.role}`}>
              <div className="recipe-chat-bubble-content">
                {msg.role === 'assistant' ? displayContent(msg.content) : msg.content}
              </div>
            </div>
          )
        })}
        {isStreaming && messages.length > 0 && messages[messages.length - 1].role === 'user' && (
          <div className="recipe-chat-bubble assistant">
            <div className="recipe-chat-bubble-content recipe-chat-typing">Thinking...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="recipe-chat-error">{error}</div>
      )}

      {pendingRecipe && (
        <div className="recipe-chat-banner">
          <div className="recipe-chat-banner-row">
            {pendingRecipe.imageUrl && (
              <img className="recipe-chat-banner-img" src={pendingRecipe.imageUrl} alt={pendingRecipe.title} />
            )}
            <div className="recipe-chat-banner-info">
              <strong>{pendingRecipe.title}</strong>
              <span>{pendingRecipe.ingredients.length} ingredients, {pendingRecipe.steps.length} steps</span>
              {pendingRecipe.imageCredit && (
                <span className="recipe-chat-credit">
                  Photo by <a href={pendingRecipe.imageCredit.link} target="_blank" rel="noopener noreferrer">{pendingRecipe.imageCredit.name}</a> on Unsplash
                </span>
              )}
            </div>
          </div>
          <div className="recipe-chat-banner-actions">
            <button className="save-btn" onClick={handleSaveRecipe}>Save Recipe</button>
            <button className="nav-btn" onClick={dismissRecipe}>Keep Editing</button>
          </div>
        </div>
      )}

      <div className="recipe-chat-input-row">
        {showAutocomplete && filteredRecipes.length > 0 && (
          <div className="recipe-autocomplete">
            {filteredRecipes.map((r, i) => (
              <button
                key={r.id}
                className={`recipe-autocomplete-item ${i === autocompleteIndex ? 'active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); handleSelectRecipe(r) }}
              >
                {r.imageUrl && <img src={r.imageUrl} alt="" />}
                <div className="recipe-autocomplete-info">
                  <span className="recipe-autocomplete-title">{r.title}</span>
                  <span className="recipe-autocomplete-meta">
                    {r.ingredients.length} ingredients
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="recipe-chat-form">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            placeholder="Describe your recipe idea..."
            disabled={isStreaming}
            autoFocus
          />
          <button type="submit" disabled={isStreaming || !input.trim()}>
            Send
          </button>
        </form>
        {messages.length > 0 && !pendingRecipe && (
          <button
            className="recipe-chat-finalize"
            onClick={requestFinalize}
            disabled={isStreaming}
          >
            Build Recipe
          </button>
        )}
      </div>
    </div>
  )
}
