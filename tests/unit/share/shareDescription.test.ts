import { describe, it, expect } from 'vitest'
import { buildRecipeHtml } from '../../../api/_lib/recipeHtml.js'

function desc(payload: Record<string, unknown>): string {
  const html = buildRecipeHtml(payload as never, 'https://mise.swinch.dev/api/r?d=x', 'x')
  return html.match(/<meta property="og:description" content="([^"]*)"/)![1]
}

const BUFFALO = {
  t: 'Buffalo Chicken Mac and Cheese',
  ig: ['24 oz chicken breast', '1.5 cups cottage cheese', '0.5 cup buffalo sauce', '1 mac and cheese packet'],
  st: ['Air fry the chicken', 'Blend the sauce', 'Combine and serve'],
}

describe('share page og:description', () => {
  it('names the actual ingredients instead of counting them', () => {
    const d = desc(BUFFALO)
    expect(d).toMatch(/chicken breast/i)
    expect(d).toContain('cottage cheese')
    expect(d).not.toMatch(/^A recipe with/)
  })

  it('capitalizes each sentence', () => {
    expect(desc(BUFFALO)).toMatch(/^Chicken breast/)
    expect(desc({ ...BUFFALO, tt: 45 })).toContain('. Ready in')
  })

  it('strips quantities and units from ingredient names', () => {
    const d = desc(BUFFALO)
    expect(d).not.toContain('24 oz')
    expect(d).not.toContain('1.5 cups')
  })

  it('summarises the tail rather than listing everything', () => {
    expect(desc(BUFFALO)).toContain('and 1 more')
  })

  // Social previews truncate around 125 characters — the ceiling is the
  // constraint that actually matters, and 144 chars got flagged in production.
  it('lands in the 80-125 character range unfurlers reward', () => {
    const d = desc(BUFFALO)
    expect(d.length).toBeGreaterThanOrEqual(80)
    expect(d.length).toBeLessThanOrEqual(125)
  })

  it('pads a sparse recipe up to a usable length', () => {
    const d = desc({ t: 'Toast', ig: ['bread'], st: ['Toast it'] })
    expect(d.length).toBeGreaterThanOrEqual(80)
    expect(d.length).toBeLessThanOrEqual(125)
    expect(d).toContain('no ads')
  })

  it('never exceeds 125 characters for any shape of recipe', () => {
    const shapes = [
      BUFFALO,
      { ...BUFFALO, tt: 45, sv: 4 },
      { ...BUFFALO, tt: 120, sv: 12, cat: ['dinner'], cu: ['american'] },
      { t: 'Toast', ig: ['bread'], st: [] },
      { t: 'X', ig: [], st: [] },
    ]
    for (const s of shapes) {
      expect(desc(s).length, JSON.stringify(s).slice(0, 60)).toBeLessThanOrEqual(125)
    }
  })

  it('includes timing and servings when present', () => {
    const d = desc({ ...BUFFALO, tt: 45, sv: 4 })
    expect(d).toMatch(/ready in/i)
    expect(d).toContain('serves 4')
  })

  it('truncates on a word boundary when the recipe overflows', () => {
    const d = desc({
      t: 'Long',
      ig: ['1 cup all purpose flour', '2 large eggs', '1 stick unsalted butter'],
      st: ['step'],
      cat: ['slow cooker comfort food dinners for a crowd'],
      cu: ['modern american southern fusion barbecue'],
      tt: 120,
      sv: 8,
    })
    expect(d.length).toBeLessThanOrEqual(125)
    expect(d.endsWith('…')).toBe(true)
    expect(d).not.toMatch(/\s…$/) // no dangling space before the ellipsis
  })

  it('falls back gracefully when no ingredient survives cleaning', () => {
    const d = desc({ t: 'Mystery', ig: ['1 cup'], st: [] })
    expect(d).toContain('A recipe with 1 ingredient')
  })
})
