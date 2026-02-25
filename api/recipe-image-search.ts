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

// Tags that indicate the photo shows actual plated food
const FOOD_TAGS = new Set([
  'food', 'dish', 'plate', 'meal', 'cooking', 'recipe', 'dinner',
  'lunch', 'breakfast', 'cuisine', 'bowl', 'salad', 'soup', 'pasta',
  'chicken', 'beef', 'seafood', 'vegetable', 'noodle', 'rice',
  'appetizer', 'dessert', 'baking', 'homemade', 'delicious',
])

// Tags that indicate the photo is NOT plated food (storefront, signage, etc.)
const BAD_TAGS = new Set([
  'restaurant', 'sign', 'neon', 'storefront', 'building', 'street',
  'interior', 'menu', 'logo', 'brand', 'shop', 'store', 'window',
  'architecture', 'night', 'city', 'urban',
])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickBestFoodPhoto(results: any[]): any {
  let bestScore = -Infinity
  let bestPhoto = results[0]

  for (const photo of results) {
    const tags: string[] = (photo.tags ?? []).map((t: { title?: string }) =>
      (t.title ?? '').toLowerCase()
    )
    const desc = ((photo.description ?? '') + ' ' + (photo.alt_description ?? '')).toLowerCase()

    let score = 0
    for (const tag of tags) {
      if (FOOD_TAGS.has(tag)) score += 2
      if (BAD_TAGS.has(tag)) score -= 3
    }
    // Boost if description mentions food-related words
    if (/plate|dish|bowl|served|cooked|homemade/.test(desc)) score += 1
    if (/restaurant|sign|store|shop|building|street/.test(desc)) score -= 2

    if (score > bestScore) {
      bestScore = score
      bestPhoto = photo
    }
  }

  return bestPhoto
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
    // Fetch several candidates so we can pick the most food-relevant one
    const params = new URLSearchParams({
      query: `${foodQuery} dish`,
      per_page: '8',
      orientation: 'landscape',
    })

    const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
      headers: { Authorization: `Client-ID ${apiKey}` },
    })

    if (!response.ok) {
      return res.status(200).json({ imageUrl: null })
    }

    const data = await response.json()
    const results = data.results ?? []

    if (results.length === 0) {
      return res.status(200).json({ imageUrl: null })
    }

    // Pick the best candidate: prefer photos tagged with food/dish/plate
    // keywords over restaurant storefronts, signage, etc.
    const photo = pickBestFoodPhoto(results)

    // Use the "regular" size (1080px wide) — good for recipe cards
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
