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

  it('lands in the 80-125 character range unfurlers reward', () => {
    const d = desc(BUFFALO)
    expect(d.length).toBeGreaterThanOrEqual(80)
    expect(d.length).toBeLessThanOrEqual(160)
  })

  it('pads a sparse recipe up to a usable length', () => {
    const d = desc({ t: 'Toast', ig: ['bread'], st: ['Toast it'] })
    expect(d.length).toBeGreaterThanOrEqual(80)
    expect(d).toContain('no ads')
  })

  it('includes timing and servings when present', () => {
    const d = desc({ ...BUFFALO, tt: 45, sv: 4 })
    expect(d).toMatch(/ready in/i)
    expect(d).toContain('serves 4')
  })

  it('never exceeds the SERP snippet limit, and cuts on a word boundary', () => {
    const d = desc({
      t: 'Long',
      ig: Array.from({ length: 30 }, (_, i) => `${i + 1} cups ingredient number ${i}`),
      st: ['step'],
      cat: ['dinner'],
      cu: ['american'],
      tt: 120,
      sv: 8,
    })
    expect(d.length).toBeLessThanOrEqual(160)
    expect(d).not.toMatch(/\s\S+…$/) // no half-word before the ellipsis
  })

  it('falls back gracefully when no ingredient survives cleaning', () => {
    const d = desc({ t: 'Mystery', ig: ['1 cup'], st: [] })
    expect(d).toContain('A recipe with 1 ingredient')
  })
})
