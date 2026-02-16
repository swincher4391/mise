import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkKrogerAuth, logoutKroger } from '@infrastructure/kroger/krogerTokenStore.ts'

const originalFetch = globalThis.fetch

beforeEach(() => {
  globalThis.fetch = vi.fn() as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('krogerTokenStore', () => {
  it('calls status endpoint with same-origin credentials and returns true when authenticated', async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ authenticated: true }),
    } as unknown as Response)

    const authenticated = await checkKrogerAuth()

    expect(authenticated).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('/api/grocery/kroger-status', {
      credentials: 'same-origin',
    })
  })

  it('returns false when fetch fails', async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockRejectedValue(new Error('network error'))

    const authenticated = await checkKrogerAuth()

    expect(authenticated).toBe(false)
    expect(fetchMock).toHaveBeenCalledWith('/api/grocery/kroger-status', {
      credentials: 'same-origin',
    })
  })

  it('calls logout endpoint with POST and same-origin credentials', async () => {
    const fetchMock = vi.mocked(globalThis.fetch)
    fetchMock.mockResolvedValue({ ok: true } as unknown as Response)

    await logoutKroger()

    expect(fetchMock).toHaveBeenCalledWith('/api/grocery/kroger-logout', {
      method: 'POST',
      credentials: 'same-origin',
    })
  })
})
