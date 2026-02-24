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

function escJson(text: string): string {
  return JSON.stringify(text).slice(1, -1)
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export function buildRecipeHtml(payload: SharePayload, shareUrl?: string): string {
  // Build JSON-LD
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: payload.t,
  }

  if (payload.d) jsonLd.description = payload.d
  if (payload.img) jsonLd.image = payload.img
  if (payload.a) jsonLd.author = { '@type': 'Person', name: payload.a }
  if (payload.sv) jsonLd.recipeYield = String(payload.sv)
  if (payload.pt) jsonLd.prepTime = minutesToIso8601(payload.pt)
  if (payload.ct) jsonLd.cookTime = minutesToIso8601(payload.ct)
  if (payload.tt) jsonLd.totalTime = minutesToIso8601(payload.tt)
  if (payload.kw?.length) jsonLd.keywords = payload.kw.join(', ')
  if (payload.cu?.length) jsonLd.recipeCuisine = payload.cu
  if (payload.cat?.length) jsonLd.recipeCategory = payload.cat

  jsonLd.recipeIngredient = payload.ig
  jsonLd.recipeInstructions = payload.st.map((text, i) => ({
    '@type': 'HowToStep',
    position: i + 1,
    text,
  }))

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

  if (payload.src) jsonLd.url = payload.src

  const jsonLdStr = JSON.stringify(jsonLd, null, 2)

  // Build HTML
  const title = esc(payload.t)
  const desc = payload.d ? esc(payload.d) : ''

  const timeParts: string[] = []
  if (payload.pt) timeParts.push(`Prep: ${formatTime(payload.pt)}`)
  if (payload.ct) timeParts.push(`Cook: ${formatTime(payload.ct)}`)
  if (payload.tt) timeParts.push(`Total: ${formatTime(payload.tt)}`)

  const ingredientsHtml = payload.ig
    .map((ig) => `        <li>${esc(ig)}</li>`)
    .join('\n')

  const stepsHtml = payload.st
    .map((s, i) => `        <li><span class="step-num">${i + 1}</span>${esc(s)}</li>`)
    .join('\n')

  const nutritionHtml = payload.n
    ? buildNutritionHtml(payload.n)
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Mise</title>
  <meta property="og:title" content="${esc(payload.t)}">
  <meta property="og:description" content="${desc || `Recipe with ${payload.ig.length} ingredients`}">
  <meta property="og:type" content="article">
  ${payload.img ? `<meta property="og:image" content="${esc(payload.img)}">` : ''}
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
    .description { color: #444; margin: 12px 0 20px; font-style: italic; }
    .recipe-img { width: 100%; max-height: 400px; object-fit: cover; border-radius: 8px; margin-bottom: 20px; }
    h2 { font-size: 1.2rem; margin: 24px 0 12px; color: #333; border-bottom: 2px solid #e8e5d8; padding-bottom: 4px; }
    .ingredients li { padding: 6px 0; border-bottom: 1px solid #f0ede4; list-style: none; }
    .steps { list-style: none; counter-reset: step; }
    .steps li { padding: 10px 0; border-bottom: 1px solid #f0ede4; display: flex; gap: 12px; }
    .step-num {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 28px; height: 28px; background: #5d6a3f; color: #fff;
      border-radius: 50%; font-size: 0.85rem; font-weight: 600; flex-shrink: 0;
    }
    .nutrition { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-top: 8px; }
    .nutrition-item { background: #f5f3ec; padding: 8px 12px; border-radius: 6px; font-size: 0.9rem; }
    .nutrition-label { color: #888; font-size: 0.8rem; }
    .cta {
      display: inline-block; margin: 32px 0 16px; padding: 12px 24px;
      background: #5d6a3f; color: #fff; text-decoration: none;
      border-radius: 8px; font-weight: 600; font-size: 1rem;
    }
    .cta:hover { background: #4e5a34; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e8e5d8; color: #999; font-size: 0.8rem; }
    .footer a { color: #5d6a3f; }
    ${payload.src ? `.source-link { color: #5d6a3f; font-size: 0.85rem; }` : ''}
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
    ${payload.src ? `<a class="source-link" href="${esc(payload.src)}">Original recipe</a>` : ''}
  </div>

  ${payload.img ? `<img class="recipe-img" src="${esc(payload.img)}" alt="${title}">` : ''}

  <h2>Ingredients</h2>
  <ul class="ingredients">
${ingredientsHtml}
  </ul>

  <h2>Instructions</h2>
  <ol class="steps">
${stepsHtml}
  </ol>

${nutritionHtml}

  <a class="cta" href="https://mise.swinch.dev${shareUrl ? `?url=${encodeURIComponent(shareUrl)}` : ''}">Open in Mise</a>

  <div class="footer">
    Shared from <a href="https://mise.swinch.dev">Mise</a> — recipe extraction for any URL.
  </div>
</body>
</html>`
}

function buildNutritionHtml(n: NonNullable<SharePayload['n']>): string {
  const items: string[] = []
  if (n.cal != null) items.push(`<div class="nutrition-item"><div class="nutrition-label">Calories</div>${n.cal}</div>`)
  if (n.protein != null) items.push(`<div class="nutrition-item"><div class="nutrition-label">Protein</div>${n.protein}g</div>`)
  if (n.carb != null) items.push(`<div class="nutrition-item"><div class="nutrition-label">Carbs</div>${n.carb}g</div>`)
  if (n.fat != null) items.push(`<div class="nutrition-item"><div class="nutrition-label">Fat</div>${n.fat}g</div>`)
  if (n.fiber != null) items.push(`<div class="nutrition-item"><div class="nutrition-label">Fiber</div>${n.fiber}g</div>`)
  if (n.sugar != null) items.push(`<div class="nutrition-item"><div class="nutrition-label">Sugar</div>${n.sugar}g</div>`)
  if (n.sodium != null) items.push(`<div class="nutrition-item"><div class="nutrition-label">Sodium</div>${n.sodium}mg</div>`)

  if (items.length === 0) return ''
  return `
  <h2>Nutrition</h2>
  <div class="nutrition">
    ${items.join('\n    ')}
  </div>`
}
