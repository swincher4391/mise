interface SharePayload {
  t: string
  a?: string
  d?: string
  img?: string
  sv?: number
  pt?: number
  ct?: number
  tt?: number
  ig: string[]
  st: string[]
  n?: {
    cal?: number
    fat?: number
    satFat?: number
    carb?: number
    fiber?: number
    sugar?: number
    protein?: number
    chol?: number
    sodium?: number
  }
  kw?: string[]
  cu?: string[]
  cat?: string[]
  src?: string
}

function minutesToIso8601(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `PT${h}H${m}M`
  if (h > 0) return `PT${h}H`
  return `PT${m}M`
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Strip per-ingredient cost annotations like "($2.09)" from ingredient text. */
function stripCostAnnotations(text: unknown): string {
  return String(text ?? '').replace(/\s*\(\$\d+(?:\.\d{1,2})?\)/g, '').trim()
}

/** Only allow http/https URLs — blocks javascript:, data:, vbscript:, etc. */
function safeUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return url
    }
    return null
  } catch {
    return null
  }
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** Build a generated (non-copyrightable) description from recipe facts. */
/**
 * Social previews reward >=80 characters and truncate around 125.
 * Longest pad first — the shorter one is the fallback when the recipe already
 * fills most of the line.
 */
const MIN_DESC = 80
const MAX_DESC = 125

/** Brand card used whenever a recipe has no image of its own. */
const BRAND_OG_IMAGE = 'https://mise.swinch.dev/og-image.png'
const DESC_PADS = [
  ' Just the recipe: clean ingredients and steps, no ads and no life story.',
  ' Just the recipe — no ads, no life story.',
]

/** Drop a leading quantity/unit so "24 oz chicken breast" reads as "chicken breast". */
function ingredientName(raw: string): string {
  return stripCostAnnotations(raw)
    .replace(/^[\d\s./¼½¾⅓⅔⅛-]+/, '')
    .replace(/^(?:oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|cups?|tbsps?|tsps?|tablespoons?|teaspoons?|cloves?|sprigs?|cans?|packets?|sticks?|slices?|pinch(?:es)?)\b\s*/i, '')
    .replace(/,.*$/, '')
    .trim()
}

/**
 * The text under every shared link. "A recipe with 3 ingredients and 3 steps"
 * is 40 characters of nothing — it describes the *shape* of the recipe, not the
 * food. Unfurlers want 80–125 characters, and a reader wants to know what's in
 * it, so lead with the actual ingredients and fall back to the brand promise
 * when the recipe is too sparse to fill the line.
 */
function buildGeneratedDesc(p: SharePayload): string {
  const parts: string[] = []

  const named = p.ig.map(ingredientName).filter((n) => n.length > 1 && n.length < 32)
  if (named.length) {
    const lead = named.slice(0, 3).join(', ')
    parts.push(named.length > 3 ? `${lead}, and ${named.length - 3} more` : lead)
  }

  const facts: string[] = []
  if (p.tt) facts.push(`ready in ${formatTime(p.tt)}`)
  else if (p.ct) facts.push(`${formatTime(p.ct)} cook time`)
  if (p.sv) facts.push(`serves ${p.sv}`)
  if (p.st.length) facts.push(`${p.st.length} step${p.st.length === 1 ? '' : 's'}`)
  if (facts.length) parts.push(facts.join(', '))

  if (p.cat?.length) parts.push(p.cat.join(', ').toLowerCase())
  if (p.cu?.length) parts.push(p.cu.join(', ').toLowerCase())

  // Nothing usable came out of the payload — say something rather than nothing.
  if (!parts.length) {
    parts.push(`A recipe with ${p.ig.length} ingredient${p.ig.length === 1 ? '' : 's'}`)
  }

  const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)
  let desc = parts.map(capitalize).join('. ') + '.'

  // Social previews truncate around 125 characters and reward at least 80.
  // Pad a thin description with the longest tail that still fits the window.
  if (desc.length < MIN_DESC) {
    const pad = DESC_PADS.find((p) => desc.length + p.length <= MAX_DESC)
    if (pad) desc += pad
  }

  // Cut on a word boundary rather than mid-word.
  if (desc.length > MAX_DESC) desc = desc.slice(0, MAX_DESC - 1).replace(/\s+\S*$/, '') + '…'

  return desc
}

export function buildRecipeHtml(payload: SharePayload, shareUrl?: string, encodedData?: string): string {
  // Build JSON-LD
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: payload.t,
  }

  const safeImg = payload.img ? safeUrl(payload.img) : null
  const safeSrc = payload.src ? safeUrl(payload.src) : null

  const generatedDesc = buildGeneratedDesc(payload)
  jsonLd.description = generatedDesc
  // Pinterest recipe Rich Pins and Google recipe rich results both require an
  // image. Fall back to the brand card when the recipe has none, matching the
  // og:image fallback below, so structured-data validation never fails on it.
  jsonLd.image = safeImg ?? BRAND_OG_IMAGE
  if (payload.a) jsonLd.author = { '@type': 'Person', name: payload.a }
  if (payload.sv) jsonLd.recipeYield = String(payload.sv)
  if (payload.pt) jsonLd.prepTime = minutesToIso8601(payload.pt)
  if (payload.ct) jsonLd.cookTime = minutesToIso8601(payload.ct)
  if (payload.tt) jsonLd.totalTime = minutesToIso8601(payload.tt)
  if (payload.kw?.length) jsonLd.keywords = payload.kw.join(', ')
  if (payload.cu?.length) jsonLd.recipeCuisine = payload.cu
  if (payload.cat?.length) jsonLd.recipeCategory = payload.cat

  jsonLd.recipeIngredient = payload.ig.map(stripCostAnnotations)
  // Omit full recipeInstructions to avoid republishing copyrightable expression.
  // Include step count so rich results can still display "N steps".
  if (payload.st.length > 0) {
    jsonLd.recipeInstructions = [{
      '@type': 'HowToSection',
      name: 'Instructions',
      numberOfItems: payload.st.length,
    }]
  }

  if (payload.n) {
    const n = payload.n
    const nutrition: Record<string, string> = { '@type': 'NutritionInformation' }
    if (n.cal != null) nutrition.calories = `${n.cal} calories`
    if (n.fat != null) nutrition.fatContent = `${n.fat} g`
    if (n.satFat != null) nutrition.saturatedFatContent = `${n.satFat} g`
    if (n.carb != null) nutrition.carbohydrateContent = `${n.carb} g`
    if (n.fiber != null) nutrition.fiberContent = `${n.fiber} g`
    if (n.sugar != null) nutrition.sugarContent = `${n.sugar} g`
    if (n.protein != null) nutrition.proteinContent = `${n.protein} g`
    if (n.chol != null) nutrition.cholesterolContent = `${n.chol} mg`
    if (n.sodium != null) nutrition.sodiumContent = `${n.sodium} mg`
    jsonLd.nutrition = nutrition
  }

  if (safeSrc) jsonLd.url = safeSrc

  // Prevent </script> breakout inside JSON-LD (CWE-79)
  const jsonLdStr = JSON.stringify(jsonLd, null, 2).replace(/<\//g, '<\\/')

  // Build HTML
  const title = esc(payload.t)
  const desc = esc(generatedDesc)

  const timeParts: string[] = []
  if (payload.pt) timeParts.push(`Prep: ${formatTime(payload.pt)}`)
  if (payload.ct) timeParts.push(`Cook: ${formatTime(payload.ct)}`)
  if (payload.tt) timeParts.push(`Total: ${formatTime(payload.tt)}`)

  const ingredientsHtml = payload.ig
    .map((ig) => `        <li>${esc(stripCostAnnotations(ig))}</li>`)
    .join('\n')

  const stepCount = payload.st.length

  // Most extracted recipes carry no image. Without a fallback these shared
  // links preview as bare text on Reddit/Slack/iMessage — the branded card is
  // what makes a dropped link look worth clicking.
  const ogImage = safeImg ?? BRAND_OG_IMAGE

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Mise</title>
  <meta property="og:title" content="${esc(payload.t)}">
  <meta property="og:description" content="${desc}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Mise">
  ${shareUrl ? `<meta property="og:url" content="${esc(shareUrl)}">` : ''}
  <meta property="og:image" content="${esc(ogImage)}">
  ${shareUrl ? `<link rel="canonical" href="${esc(shareUrl)}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(payload.t)}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image" content="${esc(ogImage)}">
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#2d5016">
  <link rel="icon" href="https://mise.swinch.dev/icon-192.png">
  <meta name="pinterest-rich-pin" content="true">
  <script type="application/ld+json">
${jsonLdStr}
  </script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 680px; margin: 0 auto; padding: 24px 16px;
      color: #1a1a1a; background: #fafaf8; line-height: 1.6;
    }
    .header { margin-bottom: 24px; }
    h1 { font-size: 1.75rem; margin-bottom: 8px; color: #111; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 4px; }
    .meta span { margin-right: 16px; }
    .description { color: #444; margin: 12px 0 20px; }
    h2 { font-size: 1.2rem; margin: 24px 0 12px; color: #333; border-bottom: 2px solid #e8e5d8; padding-bottom: 4px; }
    .ingredients li { padding: 6px 0; border-bottom: 1px solid #f0ede4; list-style: none; }
    .steps-preview { background: #f5f3ec; border-radius: 8px; padding: 16px 20px; margin-top: 8px; }
    .steps-preview p { color: #444; margin-bottom: 12px; }
    .steps-preview .features { list-style: none; color: #555; font-size: 0.9rem; }
    .steps-preview .features li { padding: 4px 0; }
    .steps-preview .features li::before { content: "\\2713 "; color: #5d6a3f; font-weight: 600; }
    .cta-top {
      display: block; margin: 0 0 20px; padding: 14px 24px;
      background: #5d6a3f; color: #fff; text-decoration: none;
      border-radius: 8px; font-weight: 600; font-size: 1rem;
      text-align: center;
    }
    .cta-top:hover { background: #4e5a34; }
    .cta-top .cta-sub { display: block; font-size: 0.8rem; font-weight: 400; opacity: 0.9; margin-top: 2px; }
    .cta {
      display: inline-block; margin: 32px 0 16px; padding: 12px 24px;
      background: #5d6a3f; color: #fff; text-decoration: none;
      border-radius: 8px; font-weight: 600; font-size: 1rem;
    }
    .cta:hover { background: #4e5a34; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e8e5d8; color: #999; font-size: 0.8rem; }
    .footer a { color: #5d6a3f; }
    ${safeSrc ? `.source-link { color: #5d6a3f; font-size: 0.85rem; }` : ''}
  </style>
</head>
<body>
  <div class="header">
    <h1>${title}</h1>
    <div class="meta">
      ${payload.a ? `<span>By ${esc(payload.a)}</span>` : ''}
      ${payload.sv ? `<span>Serves ${payload.sv}</span>` : ''}
      ${timeParts.map((p) => `<span>${p}</span>`).join(' ')}
    </div>
    ${desc ? `<p class="description">${desc}</p>` : ''}
    ${safeSrc ? `<a class="source-link" href="${esc(safeSrc)}">Original recipe</a>` : ''}
  </div>

  <a class="cta-top" href="https://mise.swinch.dev${encodedData ? `?import=${encodeURIComponent(encodedData)}` : shareUrl ? `?url=${encodeURIComponent(shareUrl)}` : ''}">Save to Mise — cook it step by step<span class="cta-sub">Cooking mode, grocery lists, and meal planning — free</span></a>


  <h2>Ingredients</h2>
  <ul class="ingredients">
${ingredientsHtml}
  </ul>

  <h2>Instructions</h2>
  <div class="steps-preview">
    <p>${stepCount} steps — open in Mise for hands-free cooking mode.</p>
    <ul class="features">
      <li>Step-by-step cooking mode with large text</li>
      <li>Scale ingredients for any serving size</li>
      <li>Add to meal plan and grocery list</li>
    </ul>
  </div>

  <a class="cta" id="open-cta" href="https://mise.swinch.dev${encodedData ? `?import=${encodeURIComponent(encodedData)}` : shareUrl ? `?url=${encodeURIComponent(shareUrl)}` : ''}">Open Full Recipe in Mise</a>
  ${safeSrc ? `<p style="margin-top: 12px; font-size: 0.85rem; color: #888;">or <a href="${esc(safeSrc)}" style="color: #5d6a3f;">view original recipe</a></p>` : ''}

  <div class="footer">
    Shared from <a href="https://mise.swinch.dev">Mise</a> — recipe extraction for any URL.
  </div>
</body>
</html>`
}

