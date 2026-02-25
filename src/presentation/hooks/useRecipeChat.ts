import { useState, useCallback, useRef } from 'react'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface PendingRecipe {
  title: string
  ingredients: string[]
  steps: string[]
  servings: string | null
  prepTime: string | null
  cookTime: string | null
  imageUrl: string | null
  imageCredit: { name: string; link: string } | null
}

function parseRecipeJson(text: string): PendingRecipe | null {
  // Accept both ```recipe-json and ```json blocks
  const match = text.match(/```(?:recipe-json|json)\s*([\s\S]*?)```/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1].trim())
    if (!parsed.title || !Array.isArray(parsed.ingredients) || !Array.isArray(parsed.steps)) {
      return null
    }
    return {
      title: parsed.title,
      ingredients: parsed.ingredients,
      steps: parsed.steps,
      servings: parsed.servings ?? null,
      prepTime: parsed.prepTime ?? null,
      cookTime: parsed.cookTime ?? null,
      imageUrl: null,
      imageCredit: null,
    }
  } catch {
    return null
  }
}

async function fetchRecipeImage(title: string): Promise<{ imageUrl: string | null; credit: { name: string; link: string } | null }> {
  try {
    const response = await fetch(`/api/recipe-image-search?q=${encodeURIComponent(title)}`)
    if (!response.ok) return { imageUrl: null, credit: null }
    const data = await response.json()
    return { imageUrl: data.imageUrl ?? null, credit: data.credit ?? null }
  } catch {
    return { imageUrl: null, credit: null }
  }
}

export function useRecipeChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingRecipe, setPendingRecipe] = useState<PendingRecipe | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    setError(null)

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setIsStreaming(true)

    // Prepare messages for API (role + content only)
    const apiMessages = updatedMessages.map(m => ({ role: m.role, content: m.content }))

    try {
      abortRef.current = new AbortController()
      const response = await fetch('/api/recipe-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        let errorMessage = 'Failed to get response'
        try {
          const errData = await response.json()
          errorMessage = errData.error || errorMessage
        } catch {
          // ignore
        }
        throw new Error(errorMessage)
      }

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)

          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              throw new Error(parsed.error)
            }
            if (parsed.content) {
              assistantContent += parsed.content
              // Update messages with streaming content
              setMessages(prev => {
                const copy = [...prev]
                const lastIdx = copy.length - 1
                if (lastIdx >= 0 && copy[lastIdx].role === 'assistant') {
                  copy[lastIdx] = { role: 'assistant', content: assistantContent }
                } else {
                  copy.push({ role: 'assistant', content: assistantContent })
                }
                return copy
              })
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Failed to get response') {
              // JSON parse errors are expected for partial chunks
            }
          }
        }
      }

      // After streaming complete, check for recipe-json block
      const recipe = parseRecipeJson(assistantContent)
      if (recipe) {
        setPendingRecipe(recipe)
        // Fetch image in background — update pendingRecipe when it arrives
        fetchRecipeImage(recipe.title).then(({ imageUrl, credit }) => {
          if (imageUrl) {
            setPendingRecipe(prev => prev ? { ...prev, imageUrl, imageCredit: credit } : null)
          }
        })
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'An error occurred'
      setError(msg)
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [messages, isStreaming])

  const requestFinalize = useCallback(() => {
    sendMessage('Please output the final recipe in recipe-json format.')
  }, [sendMessage])

  const clearChat = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    setMessages([])
    setIsStreaming(false)
    setError(null)
    setPendingRecipe(null)
  }, [])

  const dismissRecipe = useCallback(() => {
    setPendingRecipe(null)
  }, [])

  return {
    messages,
    isStreaming,
    error,
    pendingRecipe,
    sendMessage,
    requestFinalize,
    clearChat,
    dismissRecipe,
  }
}
