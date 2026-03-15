import type { VercelRequest, VercelResponse } from '@vercel/node'

const NORMALIZE_SYSTEM_PROMPT = `You are a food ingredient normalizer. Given a list of raw ingredient strings from a recipe, map each to a clean USDA-friendly base ingredient name.

Rules:
- Strip quantities, prep instructions, and modifiers. "2 cups all-purpose flour, sifted" → "all-purpose flour"
- Use standard USDA names: "chicken breast" not "boneless skinless chicken breasts"
- For compound ingredients, extract the primary ingredient: "2 stalks of green garlic, or scallions" → "green garlic"
- Set action to "SKIP" for zero-nutrition seasonings: salt, pepper, water, ice, cooking spray
- Set action to "ESTIMATE_QUANTITY" for ingredients with "to taste", "as needed", or missing quantities — include a suggested default quantity in grams
- Set action to "MATCH" for all other ingredients
- Return valid JSON only, no markdown fences, no explanation

Input: an array of raw ingredient strings
Output: a JSON object with this exact structure:
{"normalized":[{"raw":"original string","name":"clean name","action":"MATCH"},{"raw":"salt to taste","name":"salt","action":"SKIP"},{"raw":"sugar as needed","name":"sugar","action":"ESTIMATE_QUANTITY","defaultGrams":10}]}`

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
  "ingredients": [
    {"text": "2 cups all-purpose flour", "usdaName": "all-purpose flour"},
    {"text": "3 large eggs, beaten", "usdaName": "egg"},
    {"text": "1 tsp salt", "usdaName": "salt"}
  ],
  "steps": ["Preheat oven to 375°F.", "In a large bowl, combine flour and salt.", "Add eggs and mix until a shaggy dough forms."],
  "servings": "4",
  "prepTime": "20 min",
  "cookTime": "35 min"
}
\`\`\`

Each ingredient must be an object with "text" (the full display string) and "usdaName" (the clean USDA-standard base ingredient name, e.g. "chicken breast" not "boneless skinless chicken breasts").

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

  const { messages, mode, ingredients } = req.body ?? {}

  // ---------- Normalize mode: non-streaming JSON response ----------
  if (mode === 'normalize') {
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      return res.status(400).json({ error: 'Missing ingredients array for normalize mode' })
    }

    try {
      const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'Qwen/Qwen3-14B',
          messages: [
            { role: 'system', content: NORMALIZE_SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(ingredients) },
          ],
          max_tokens: 1024,
          temperature: 0.1,
          stream: false,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        return res.status(502).json({ error: `HF API error (${response.status}): ${errorText.slice(0, 200)}` })
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content ?? ''

      // Strip </think>...</think> wrapper and markdown fences if present
      const cleaned = content
        .replace(/<think>[\s\S]*?<\/think>/g, '')
        .replace(/```(?:json)?\s*/g, '')
        .replace(/```/g, '')
        .trim()

      try {
        const parsed = JSON.parse(cleaned)
        return res.status(200).json(parsed)
      } catch {
        return res.status(502).json({ error: 'Failed to parse LLM response as JSON', raw: cleaned })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return res.status(500).json({ error: `Normalization failed: ${message}` })
    }
  }

  // ---------- Default chat mode: SSE streaming ----------
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
