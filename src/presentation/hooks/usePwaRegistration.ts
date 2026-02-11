import { useState, useEffect } from 'react'

interface PwaStatus {
  needRefresh: boolean
  offlineReady: boolean
  updateServiceWorker: () => void
}

/**
 * Hook to register PWA service worker and track status.
 * Uses dynamic import to avoid issues in dev/test environments.
 */
export function usePwaRegistration(): PwaStatus {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [updateSw, setUpdateSw] = useState<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false

    async function register() {
      try {
        const { registerSW } = await import('virtual:pwa-register')
        if (cancelled) return

        const update = registerSW({
          onNeedRefresh() {
            if (!cancelled) setNeedRefresh(true)
          },
          onOfflineReady() {
            if (!cancelled) setOfflineReady(true)
          },
        })
        if (!cancelled) setUpdateSw(() => update)
      } catch {
        // PWA registration not available (e.g., in dev mode without SW)
      }
    }

    register()
    return () => { cancelled = true }
  }, [])

  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: () => updateSw?.(),
  }
}
