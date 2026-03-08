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

async function proxyImageToTempHost(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
  })
  if (!resp.ok) throw new Error(`Failed to fetch image (${resp.status})`)

  const contentType = resp.headers.get('content-type') ?? 'image/jpeg'
  if (!contentType.startsWith('image/')) throw new Error('URL does not point to an image')

  const buffer = Buffer.from(await resp.arrayBuffer())
  if (buffer.length > MAX_IMAGE_SIZE) throw new Error('Image exceeds 5MB limit')

  const ext = contentType.split('/')[1]?.split(';')[0] ?? 'jpg'
  const boundary = '----MiseBoundary' + Date.now()
  const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recipe.${ext}"\r\nContent-Type: ${contentType}\r\n\r\n`
  const footer = `\r\n--${boundary}--\r\n`

  const body = Buffer.concat([
    Buffer.from(header, 'utf-8'),
    buffer,
    Buffer.from(footer, 'utf-8'),
  ])

  const uploadResp = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  })

  if (!uploadResp.ok) throw new Error(`Image re-upload failed (${uploadResp.status})`)

  const data: any = await uploadResp.json()
  const pageUrl: string = data?.data?.url
  if (!pageUrl) throw new Error('No URL returned from image host')

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

  const { image, imageUrl: directUrl } = req.body ?? {}

  if (!image && !directUrl) {
    return res.status(400).json({ error: 'Missing image or imageUrl field in request body' })
  }

  if (image) {
    if (typeof image !== 'string') {
      return res.status(400).json({ error: 'image must be a string' })
    }
    // Validate base64 size (rough estimate — base64 is ~33% larger than raw)
    const estimatedBytes = (image.length * 3) / 4
    if (estimatedBytes > MAX_IMAGE_SIZE) {
      return res.status(400).json({ error: 'Image exceeds 5MB limit' })
    }
  }

  if (directUrl && typeof directUrl !== 'string') {
    return res.status(400).json({ error: 'imageUrl must be a string' })
  }

  try {
    // Proxy image URL through tmpfiles.org so HuggingFace can access it
    // (many CDNs like Facebook block non-browser requests)
    const imageUrl = directUrl
      ? await proxyImageToTempHost(directUrl)
      : await uploadToTempHost(image)

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
