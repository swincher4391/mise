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
    }
  } catch {
    return null
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
      let lineBuf = ''
      const processSseLine = (rawLine: string) => {
        const line = rawLine.trim()
        if (!line.startsWith('data: ')) return

        const data = line.slice(6).trim()
        if (!data || data === '[DONE]') return

        let parsed: any
        try {
          parsed = JSON.parse(data)
        } catch {
          // Ignore malformed JSON frames and keep streaming
          return
        }

        if (parsed.error) {
          throw new Error(parsed.error)
        }

        if (parsed.content) {
          assistantContent += parsed.content
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
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        lineBuf += decoder.decode(value, { stream: true })
        const lines = lineBuf.split('\n')
        // Keep the last (potentially incomplete) line in the buffer
        lineBuf = lines.pop() ?? ''

        for (const line of lines) {
          processSseLine(line)
        }
      }

      if (lineBuf.trim()) {
        processSseLine(lineBuf)
      }

      // After streaming complete, check for recipe-json block
      const recipe = parseRecipeJson(assistantContent)
      if (recipe) {
        setPendingRecipe(recipe)
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
