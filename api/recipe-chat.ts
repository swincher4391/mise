import type { VercelRequest, VercelResponse } from '@vercel/node'

const SYSTEM_PROMPT = `You are a skilled home cook and recipe developer for Mise, a recipe app. Help users create delicious, well-tested recipes through conversation.

Conversation guidelines:
- Ask clarifying questions about cuisine preferences, dietary restrictions, serving size, and skill level
- Strictly respect dietary restrictions mentioned at any point (vegetarian, vegan, gluten-free, etc.) — never suggest ingredients that violate them
- Suggest ingredient substitutions when asked
- Keep responses concise and conversational
- Do NOT write out a full recipe during conversation. Discuss ideas, suggest directions, and refine — save the structured recipe for the finalize step.

Recipe quality standards (apply these when generating the final recipe):
- Write recipes from scratch — never rely on store-bought shortcuts like frozen meatballs, canned soup, or jarred sauce unless the user specifically asks for a shortcut version
- Use realistic quantities that match the serving count (e.g., 4 servings of meatballs needs ~16-20 meatballs, not 4)
- Include proper seasoning — salt, pepper, herbs, spices. Bland recipes are bad recipes.
- Write clear, detailed steps. Each step should be one logical action. Avoid cramming multiple techniques into a single step.
- Include sensory cues: "until golden brown", "until onions are translucent", "until internal temp reaches 165F"
- Ingredients should be listed in the order they're used, with prep notes (diced, minced, etc.)
- Prep and cook times should be realistic for the steps described

When the user explicitly asks to finalize or build the recipe, output ONLY a \`\`\`recipe-json code block with no other text before or after it.

The recipe-json block must contain valid JSON with this exact structure:
\`\`\`recipe-json
{
  "title": "Recipe Name",
  "ingredients": ["2 cups all-purpose flour", "3 large eggs, beaten"],
  "steps": ["Preheat oven to 375°F.", "In a large bowl, combine flour and salt.", "Add eggs and mix until a shaggy dough forms."],
  "servings": "4",
  "prepTime": "20 min",
  "cookTime": "35 min"
}
\`\`\`

IMPORTANT: Never include the recipe-json block unless the user explicitly asks to finalize. During conversation, only discuss the recipe in plain text.`

const MAX_MESSAGES = 10

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.HF_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'HF_API_KEY not configured on server' })
  }

  const { messages } = req.body ?? {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing messages array in request body' })
  }

  // Take last N messages from client, prepend system prompt
  const recentMessages = messages.slice(-MAX_MESSAGES)
  const fullMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...recentMessages,
  ]

  try {
    // SSE streaming headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen3-14B',
        messages: fullMessages,
        max_tokens: 2048,
        temperature: 0.7,
        stream: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      res.write(`data: ${JSON.stringify({ error: `HF API error (${response.status}): ${errorText.slice(0, 200)}` })}\n\n`)
      res.write('data: [DONE]\n\n')
      return res.end()
    }

    if (!response.body) {
      res.write(`data: ${JSON.stringify({ error: 'No response body from HF API' })}\n\n`)
      res.write('data: [DONE]\n\n')
      return res.end()
    }

    // Read the SSE stream from HF and forward tokens to client
    const reader = (response.body as any).getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep incomplete last line in buffer
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n')
          continue
        }

        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`)
          }
        } catch {
          // Skip unparseable chunks
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim()
      if (trimmed.startsWith('data: ')) {
        const data = trimmed.slice(6)
        if (data === '[DONE]') {
          res.write('data: [DONE]\n\n')
        } else {
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`)
            }
          } catch {
            // Skip
          }
        }
      }
    }

    // Ensure DONE is sent
    res.write('data: [DONE]\n\n')
    return res.end()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.write(`data: ${JSON.stringify({ error: `Failed to chat: ${message}` })}\n\n`)
    res.write('data: [DONE]\n\n')
    return res.end()
  }
}
