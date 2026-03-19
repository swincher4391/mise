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

const VIDEO_EXTRACTION_PROMPT = `These images are frame grids from a cooking video. Each grid is a 2x2 tile of 4 sequential frames.

TRANSCRIPT_PLACEHOLDER

IMPORTANT RULES:
- ONLY include ingredients and steps that you can clearly SEE as on-screen text or HEAR in the transcript
- Do NOT guess, infer, or make up ingredients that aren't explicitly shown or mentioned
- If the transcript mentions specific quantities (e.g. "one and a half cups of cottage cheese"), use those EXACT quantities
- If you cannot clearly read or hear an ingredient, do NOT include it
- Prefer transcript quantities over visual guesses

Return ONLY valid JSON:
{
  "title": "Recipe Name",
  "ingredients": ["1.5 cups cottage cheese", "0.5 cup buffalo sauce"],
  "steps": ["Step explicitly shown or spoken"],
  "servings": "4" or null,
  "prepTime": "15 min" or null,
  "cookTime": "30 min" or null
}
If you cannot identify any recipe, return: {"error": "No recipe found"}`

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

  const { image, imageUrl: directUrl, images, transcript } = req.body ?? {}

  // Multi-image mode (video frame grids + optional transcript)
  if (images && Array.isArray(images) && images.length > 0) {
    try {
      // Upload all grid images in parallel
      const imageUrls = await Promise.all(
        images.slice(0, 4).map((img: string) => uploadToTempHost(img))
      )

      // Build prompt with transcript context if available
      let prompt = VIDEO_EXTRACTION_PROMPT
      if (transcript && typeof transcript === 'string' && transcript.length > 10) {
        prompt = prompt.replace(
          'TRANSCRIPT_PLACEHOLDER',
          `Here is the spoken transcript from the video:\n"${transcript.slice(0, 2000)}"\n`
        )
      } else {
        prompt = prompt.replace('TRANSCRIPT_PLACEHOLDER', '')
      }

      // Build multi-image content array
      const content: any[] = [{ type: 'text', text: prompt }]
      for (const url of imageUrls) {
        content.push({ type: 'image_url', image_url: { url } })
      }

      const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'Qwen/Qwen2.5-VL-7B-Instruct:hyperbolic',
          messages: [{ role: 'user', content }],
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
      const respContent = data.choices?.[0]?.message?.content ?? ''
      const jsonMatch = respContent.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        return res.status(502).json({ error: 'No JSON found in model response' })
      }
      return res.status(200).json(JSON.parse(jsonMatch[0]))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return res.status(502).json({ error: `Failed to extract recipe: ${message}` })
    }
  }

  // Single-image mode (original behavior)
  if (!image && !directUrl) {
    return res.status(400).json({ error: 'Missing image, imageUrl, or images field in request body' })
  }

  if (image) {
    if (typeof image !== 'string') {
      return res.status(400).json({ error: 'image must be a string' })
    }
    const estimatedBytes = (image.length * 3) / 4
    if (estimatedBytes > MAX_IMAGE_SIZE) {
      return res.status(400).json({ error: 'Image exceeds 5MB limit' })
    }
  }

  if (directUrl && typeof directUrl !== 'string') {
    return res.status(400).json({ error: 'imageUrl must be a string' })
  }

  try {
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
