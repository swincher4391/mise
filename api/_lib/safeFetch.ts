import { isBlockedUrl, isBlockedAfterResolve } from './ssrf.js'

const DEFAULT_MAX_REDIRECTS = 4

export interface SafeFetchOptions {
  headers?: Record<string, string>
  maxRedirects?: number
  /** Abort the whole chain after this many milliseconds. */
  timeoutMs?: number
}

/**
 * Fetch a URL, validating every redirect hop against the SSRF blocklist.
 *
 * `redirect: 'follow'` is unsafe here: by the time you can inspect
 * `response.url` the request to the redirect target has already been sent and
 * its body received. Checking afterwards only stops the response reaching the
 * client — the internal request still fired (blind SSRF), and a rebinding
 * domain can answer with a public address on the post-hoc lookup after having
 * served a private one during the fetch.
 *
 * Following redirects manually lets us validate each target *before* connecting
 * to it.
 */
export async function safeFetch(startUrl: string, options: SafeFetchOptions = {}): Promise<Response> {
  const { headers, maxRedirects = DEFAULT_MAX_REDIRECTS, timeoutMs } = options

  const controller = new AbortController()
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null

  try {
    let url = startUrl

    for (let hop = 0; hop <= maxRedirects; hop++) {
      if (isBlockedUrl(url) || (await isBlockedAfterResolve(url))) {
        throw new Error('URL is not allowed')
      }

      const response = await fetch(url, {
        headers,
        redirect: 'manual',
        signal: controller.signal,
      })

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        // Don't leave the redirect body dangling until GC.
        await response.body?.cancel().catch(() => {})

        if (!location) throw new Error(`Upstream returned ${response.status} with no location`)
        url = new URL(location, url).toString()
        continue
      }

      return response
    }

    throw new Error('Too many redirects')
  } finally {
    if (timer) clearTimeout(timer)
  }
}
