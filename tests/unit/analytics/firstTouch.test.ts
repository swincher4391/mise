/**
 * First-touch attribution: the campaign that first brought a user in must
 * survive to a checkout that can happen days later in another session.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const register = vi.fn()
vi.mock('posthog-js', () => ({
  default: {
    init: (_key: string, opts: { loaded?: (ph: unknown) => void }) => opts.loaded?.({}),
    register,
    capture: vi.fn(),
    identify: vi.fn(),
  },
}))

// The module reads VITE_POSTHOG_KEY at import time; set it before importing.
vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')

async function initWith(search: string, path = '/') {
  vi.resetModules()
  register.mockClear()
  window.history.replaceState({}, '', path + search)
  const { initAnalytics } = await import('../../../src/infrastructure/analytics/track.ts')
  initAnalytics()
}

beforeEach(() => {
  localStorage.clear()
})

describe('first-touch attribution', () => {
  it('captures and registers UTM params on first campaign visit', async () => {
    await initWith('?utm_source=reddit&utm_medium=comment&utm_campaign=recipes')

    expect(register).toHaveBeenCalledOnce()
    const props = register.mock.calls[0][0]
    expect(props.first_utm_source).toBe('reddit')
    expect(props.first_utm_medium).toBe('comment')
    expect(props.first_utm_campaign).toBe('recipes')
    expect(props.first_touch_at).toBeTruthy()
  })

  it('persists the first touch and does not overwrite it on a later visit', async () => {
    await initWith('?utm_source=reddit&utm_campaign=first')
    await initWith('?utm_source=tiktok&utm_campaign=second')

    // Second init still registers, but with the ORIGINAL reddit campaign.
    const props = register.mock.calls[0][0]
    expect(props.first_utm_source).toBe('reddit')
    expect(props.first_utm_campaign).toBe('first')
  })

  it('records no first touch for an organic visit with no UTM', async () => {
    await initWith('')
    expect(register).not.toHaveBeenCalled()
    expect(localStorage.getItem('mise_first_touch')).toBeNull()
  })

  it('lets a later UTM visit be the first attributed touch', async () => {
    await initWith('') // organic, nothing stored
    await initWith('?utm_source=pinterest&utm_campaign=pins')

    const props = register.mock.calls[0][0]
    expect(props.first_utm_source).toBe('pinterest')
  })

  it('records the landing path for context', async () => {
    await initWith('?utm_source=reddit', '/api/r')
    expect(register.mock.calls[0][0].first_landing_path).toBe('/api/r')
  })
})
