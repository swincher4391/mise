import type { VercelRequest, VercelResponse } from '@vercel/node'

const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB

const EXTRACTION_PROMPT = `Extract the recipe from this image. Return ONLY valid JSON with this structure:
{
  "title": "Recipe Name",
  "ingredients": ["1 cup flour", "2 eggs"],
  "steps": ["Preheat oven to 350F", "Mix dry ingredients"],
  "servings": "4" or null,
  "prepTime": "15 min" or null,
  "cookTime": "30 min" or null
}
If this is not a recipe image, return: {"error": "No recipe found in image"}`

async function uploadToTempHost(base64DataUrl: string): Promise<string> {
  // Strip the data URL prefix to get raw base64
  const base64Data = base64DataUrl.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  // Detect content type from the data URL
  const contentType = base64DataUrl.match(/^data:(image\/\w+);/)?.[1] ?? 'image/png'
  const ext = contentType.split('/')[1] ?? 'png'

  // Build multipart body manually for Node.js compatibility
  const boundary = '----MiseBoundary' + Date.now()
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recipe.${ext}"\r\nContent-Type: ${contentType}\r\n\r\n`
  const footer = `\r\n--${boundary}--\r\n`

  const body = Buffer.concat([
    Buffer.from(header, 'utf-8'),
    buffer,
    Buffer.from(footer, 'utf-8'),
  ])

  const response = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  })

  if (!response.ok) {
    throw new Error(`Image upload failed (${response.status})`)
  }

  const data: any = await response.json()
  const pageUrl: string = data?.data?.url
  if (!pageUrl) {
    throw new Error('No URL returned from image host')
  }

  // Convert page URL to direct download URL
  return pageUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
}

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

  const { image } = req.body ?? {}
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing image field in request body' })
  }

  // Validate base64 size (rough estimate — base64 is ~33% larger than raw)
  const estimatedBytes = (image.length * 3) / 4
  if (estimatedBytes > MAX_IMAGE_SIZE) {
    return res.status(400).json({ error: 'Image exceeds 5MB limit' })
  }

  try {
    // Upload base64 to temp host — HF Hyperbolic requires a URL, not inline base64
    const imageUrl = await uploadToTempHost(image)

    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen2.5-VL-7B-Instruct:hyperbolic',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 2048,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return res.status(502).json({
        error: `HF API error (${response.status}): ${errorText.slice(0, 200)}`,
      })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content ?? ''

    // Extract JSON from the response (model may wrap in markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return res.status(502).json({ error: 'No JSON found in model response' })
    }

    const parsed = JSON.parse(jsonMatch[0])
    return res.status(200).json(parsed)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(502).json({ error: `Failed to extract recipe: ${message}` })
  }
}
