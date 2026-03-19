/**
 * Structure a raw transcript into a recipe via LLM.
 * Accepts raw caption/transcript text and returns structured recipe text.
 * Used by the Chrome extension when it has captions but the yt-transcript
 * endpoint can't access them server-side.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const maxDuration = 30

const VISION_URL = 'https://router.huggingface.co/v1/chat/completions'
const VISION_MODEL = 'Qwen/Qwen2.5-VL-7B-Instruct:hyperbolic'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const hfKey = process.env.HF_API_KEY
  if (!hfKey) return res.status(500).json({ error: 'HF_API_KEY not configured' })

  const { transcript } = req.body ?? {}
  if (!transcript || typeof transcript !== 'string' || transcript.length < 30) {
    return res.status(400).json({ error: 'Missing or too short transcript' })
  }

  try {
    const response = await fetch(VISION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hfKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: `Below is a raw auto-generated caption transcript from a cooking video. Extract and structure it into a recipe.

CRITICAL RULES:
- Include EVERY ingredient mentioned, with EXACT quantities spoken (e.g. "one and a half cups" → "1.5 cups", "twenty-four ounces" → "24 oz")
- Use the SPECIFIC ingredient names spoken (e.g. "fat-free milk" not just "milk", "garlic salt" not just "salt", "protein pasta" not just "pasta", "smoked paprika" not just "paprika")
- Include EXACT cooking methods mentioned (e.g. "air fryer at 375" not "oven", "blend" not "mix")
- Include EXACT times mentioned (e.g. "15 minutes" not omitted)
- Do NOT summarize, generalize, or omit details. Be literal and precise.
- If the speaker says a brand name or specific product (e.g. "mac and cheese packet"), include it

Return ONLY the recipe as plain text with:
- Title on the first line
- "Ingredients:" section with each ingredient on its own line, prefixed with "- " with quantities
- "Instructions:" section with numbered steps including times and temperatures

If the transcript does not contain a recipe, return an empty string.

Transcript:
${transcript.slice(0, 3000)}`,
          },
        ],
        max_tokens: 2048,
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return res.status(502).json({ error: `LLM error (${response.status}): ${errorText.slice(0, 200)}` })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content ?? ''
    const cleaned = content.replace(/```\w*\n?/g, '').replace(/\*\*/g, '').trim()

    return res.status(200).json({ text: cleaned || '' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: message })
  }
}
