import { useState, useEffect, useRef } from 'react'
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const initialPromptSent = useRef(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (initialPrompt && !initialPromptSent.current && messages.length === 0) {
      initialPromptSent.current = true
      sendMessage(initialPrompt)
    }
  }, [initialPrompt, messages.length, sendMessage])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return
    sendMessage(input)
    setInput('')
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
        <form onSubmit={handleSubmit} className="recipe-chat-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
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
