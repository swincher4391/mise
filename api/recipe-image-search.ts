import type { VercelRequest, VercelResponse } from '@vercel/node'

// Remove cooking-method and style qualifiers so the Unsplash search
// focuses on the actual food (e.g. "Sticky Garlic Chicken Noodles"
// instead of "Kid-Friendly Air Fryer Sticky Garlic Chicken Noodles").
const NOISE_WORDS = new Set([
  'kid-friendly', 'kid friendly', 'family-friendly', 'family friendly',
  'air fryer', 'instant pot', 'slow cooker', 'crockpot', 'crock-pot',
  'pressure cooker', 'one-pot', 'one pot', 'one-pan', 'one pan',
  'sheet pan', 'sheet-pan', 'skillet', 'stovetop', 'stove-top',
  'oven-baked', 'oven baked', 'no-bake', 'no bake',
  'easy', 'quick', 'simple', 'healthy', 'light', 'lighter',
  'best', 'perfect', 'ultimate', 'classic', 'homemade', 'home-made',
  'vegan', 'vegetarian', 'gluten-free', 'gluten free', 'keto', 'paleo',
  'low-carb', 'low carb', 'high-protein', 'high protein', 'dairy-free', 'dairy free',
  'budget', 'budget-friendly', 'weeknight', 'week-night', 'meal-prep', 'meal prep',
])

function simplifyFoodQuery(title: string): string {
  let result = title
  // Remove noise phrases (longest first to catch multi-word phrases)
  for (const phrase of [...NOISE_WORDS].sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(`\\b${phrase}\\b`, 'gi'), '')
  }
  // Collapse whitespace and trim
  result = result.replace(/\s+/g, ' ').trim()
  // If we stripped too much, fall back to the original
  return result.length >= 3 ? result : title
}

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

  // Strip non-food qualifiers so Unsplash focuses on the dish itself
  const foodQuery = simplifyFoodQuery(query)

  try {
    const params = new URLSearchParams({
      query: `${foodQuery} food`,
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
