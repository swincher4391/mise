/**
 * Layer 3: Heuristic HTML extraction.
 *
 * Finds recipe content in unstructured HTML by scanning for common
 * section headings ("Ingredients", "Instructions", "Directions", etc.)
 * and extracting the content between them.
 *
 * Returns a JSON-LD-compatible object so normalizeRecipe() can handle it,
 * or null if no recipe structure is detected.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const INGREDIENT_HEADING = /^(?:🛒\s*)?ingredients/i
const INSTRUCTION_HEADING = /^(?:👩‍🍳\s*)?(?:instructions|directions|steps|method|preparation|how\s+to\s+make)/i
const STOP_HEADING = /^(?:🍽\s*)?(?:notes?|tips?|serving|variations?|nutrition|storage|faq|related|you\s+may|final\s+thoughts|comments?|leave\s+a|rate\s+this|print|similar|more\s+recipes|post\s+navigation|latest\s+posts)/i

/**
 * Extract a recipe from unstructured HTML using heading-based heuristics.
 * Returns a JSON-LD-compatible object or null.
 */
export function extractHeuristic(html: string): any | null {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Find all headings
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4'))

  let ingredientHeading: Element | null = null
  let instructionHeading: Element | null = null

  for (const h of headings) {
    const text = (h.textContent ?? '').trim()
    if (!ingredientHeading && INGREDIENT_HEADING.test(text)) {
      ingredientHeading = h
    } else if (!instructionHeading && INSTRUCTION_HEADING.test(text)) {
      instructionHeading = h
    }
    if (ingredientHeading && instructionHeading) break
  }

  // Need at least one section to proceed
  if (!ingredientHeading && !instructionHeading) return null

  const ingredients = ingredientHeading ? extractIngredients(ingredientHeading, headings) : []
  const steps = instructionHeading ? extractSteps(instructionHeading, headings) : []

  // Require meaningful content
  if (ingredients.length === 0 && steps.length === 0) return null

  // Extract title from <h1> or <title>
  const h1 = doc.querySelector('h1')
  const title = h1?.textContent?.trim()
    ?? doc.querySelector('title')?.textContent?.trim()?.replace(/\s*[|–—-]\s*.+$/, '')
    ?? 'Untitled Recipe'

  // Extract image from og:image
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null

  return {
    '@type': 'Recipe',
    name: title,
    image: ogImage,
    recipeIngredient: ingredients,
    recipeInstructions: steps.map(text => ({ '@type': 'HowToStep', text })),
  }
}

/**
 * Collect sibling elements after the ingredient heading until we hit
 * another major heading or the instruction heading. Extract <li> text.
 */
function extractIngredients(heading: Element, allHeadings: Element[]): string[] {
  const ingredients: string[] = []
  let el = heading.nextElementSibling

  while (el) {
    // Stop at any heading that's at the same or higher level,
    // or is a known non-ingredient section
    if (isStopElement(el, heading, allHeadings)) break

    // Collect <li> items from <ul> or <ol>
    if (el.tagName === 'UL' || el.tagName === 'OL') {
      for (const li of el.querySelectorAll(':scope > li')) {
        const text = cleanText(li)
        if (text && !isAdScript(text)) {
          ingredients.push(text)
        }
      }
    }

    el = el.nextElementSibling
  }

  return ingredients
}

/**
 * Collect step text after the instruction heading.
 * Handles both <p> blocks and <ol>/<ul> list items.
 * Numbered sub-headings (h3: "1. Cook the Beef") are treated as step group
 * prefixes — their text is prepended to the following paragraph content.
 */
function extractSteps(heading: Element, allHeadings: Element[]): string[] {
  const steps: string[] = []
  let el = heading.nextElementSibling
  let pendingSubheading = ''

  while (el) {
    const text = cleanText(el)

    if (isStopElement(el, heading, allHeadings)) break

    const tag = el.tagName

    if (tag === 'H3' || tag === 'H4') {
      // Numbered sub-heading like "1. Cook the Beef"
      // Strip the number prefix, use as context for next step
      pendingSubheading = (text ?? '').replace(/^\d+\.\s*/, '')
    } else if (tag === 'P' && text && !isAdScript(text)) {
      // Split on <br> — each line is a separate step
      const lines = el.innerHTML
        .split(/<br\s*\/?>/i)
        .map(frag => stripHtml(frag).trim())
        .filter(Boolean)

      for (const line of lines) {
        if (isAdScript(line)) continue
        const full = pendingSubheading
          ? `${pendingSubheading}: ${line}`
          : line
        steps.push(full)
        pendingSubheading = ''
      }
    } else if (tag === 'OL' || tag === 'UL') {
      for (const li of el.querySelectorAll(':scope > li')) {
        const liText = cleanText(li)
        if (liText && !isAdScript(liText)) {
          const full = pendingSubheading
            ? `${pendingSubheading}: ${liText}`
            : liText
          steps.push(full)
          pendingSubheading = ''
        }
      }
    }

    el = el.nextElementSibling
  }

  return steps
}

/** Check if an element should stop section collection. */
function isStopElement(el: Element, sectionHeading: Element, allHeadings: Element[]): boolean {
  const tag = el.tagName
  if (!tag.match(/^H[1-4]$/)) return false

  const text = (el.textContent ?? '').trim()

  // Same-level or higher heading stops collection
  const sectionLevel = parseInt(sectionHeading.tagName[1])
  const elLevel = parseInt(tag[1])

  if (elLevel <= sectionLevel) {
    // Stop at same/higher level heading, unless it's a known sub-section
    // of the current section (e.g., ingredient sub-groups)
    return true
  }

  // Sub-headings (h3 under h2) are okay unless they match a stop pattern
  return STOP_HEADING.test(text)
}

/** Get clean text content, stripping HTML tags. */
function cleanText(el: Element): string {
  return (el.textContent ?? '').trim()
}

/** Strip HTML tags from a fragment string. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

/** Detect ad injection script text that leaks into content. */
function isAdScript(text: string): boolean {
  return /ezstandalone|ezoic|adsbygoogle|googletag|__cmp/i.test(text)
}
