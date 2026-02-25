import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.UNSPLASH_ACCESS_KEY
  if (!apiKey) {
    return res.status(200).json({ imageUrl: null })
  }

  const query = req.query.q
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing ?q= parameter' })
  }

  try {
    const params = new URLSearchParams({
      query: `${query} food`,
      per_page: '1',
      orientation: 'landscape',
    })

    const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${apiKey}` },
    })

    if (!response.ok) {
      return res.status(200).json({ imageUrl: null })
    }

    const data = await response.json()
    const photo = data.results?.[0]

    if (!photo) {
      return res.status(200).json({ imageUrl: null })
    }

    // Use the "regular" size (1080px wide) — good for recipe cards
    // Append Unsplash UTM params per their guidelines
    return res.status(200).json({
      imageUrl: photo.urls?.regular ?? null,
      credit: {
        name: photo.user?.name ?? null,
        link: photo.user?.links?.html ?? null,
      },
    })
  } catch {
    return res.status(200).json({ imageUrl: null })
  }
}
