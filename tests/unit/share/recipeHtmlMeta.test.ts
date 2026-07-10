/**
 * Share pages are the viral loop's front door: a link dropped in a Reddit
 * comment must unfurl into a card, not bare text.
 */
import { describe, it, expect } from 'vitest'
import { buildRecipeHtml } from '../../../api/_lib/recipeHtml.js'

const BRAND_OG = 'https://mise.swinch.dev/og-image.png'

function payload(overrides: Record<string, unknown> = {}) {
  return { t: 'Test Recipe', ig: ['1 cup flour'], st: ['Mix ingredients'], ...overrides }
}

function metaContent(html: string, key: string): string | null {
  const property = html.match(
    new RegExp(`<meta\\s+property="${key}"\\s+content="([^"]*)"`, 'i'),
  )
  if (property) return property[1]
  const name = html.match(new RegExp(`<meta\\s+name="${key}"\\s+content="([^"]*)"`, 'i'))
  return name ? name[1] : null
}

describe('share page social meta', () => {
  it('falls back to the brand image when the recipe has none', () => {
    const html = buildRecipeHtml(payload(), 'https://mise.swinch.dev/api/r?d=abc', 'abc')

    expect(metaContent(html, 'og:image')).toBe(BRAND_OG)
    expect(metaContent(html, 'twitter:image')).toBe(BRAND_OG)
  })

  it("uses the recipe's own image when it has one", () => {
    const img = 'https://example.com/chicken.jpg'
    const html = buildRecipeHtml(payload({ img }), 'https://mise.swinch.dev/api/r?d=abc', 'abc')

    expect(metaContent(html, 'og:image')).toBe(img)
    expect(metaContent(html, 'twitter:image')).toBe(img)
  })

  it('falls back to the brand image rather than emitting a javascript: URL', () => {
    const html = buildRecipeHtml(
      payload({ img: 'javascript:alert(1)' }),
      'https://mise.swinch.dev/api/r?d=abc',
      'abc',
    )

    expect(metaContent(html, 'og:image')).toBe(BRAND_OG)
    expect(html).not.toContain('javascript:alert')
  })

  it('always declares a large summary card so links unfurl', () => {
    const html = buildRecipeHtml(payload(), 'https://mise.swinch.dev/api/r?d=abc', 'abc')

    expect(metaContent(html, 'twitter:card')).toBe('summary_large_image')
    expect(metaContent(html, 'og:site_name')).toBe('Mise')
  })

  it('emits exactly one viewport and one og:image tag', () => {
    const html = buildRecipeHtml(payload({ img: 'https://example.com/a.jpg' }), 'https://x/y', 'abc')

    expect(html.match(/name="viewport"/g)?.length).toBe(1)
    expect(html.match(/property="og:image"/g)?.length).toBe(1)
  })
})
