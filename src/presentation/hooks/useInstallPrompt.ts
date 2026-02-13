import { useState, useEffect, useCallback } from 'react'

const EXTRACTED_KEY = 'mise_has_extracted'

/**
 * Captures the browser's beforeinstallprompt event and defers it.
 * Only shows the install prompt after the user has experienced value
 * (extracted at least one recipe).
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [hasExtracted, setHasExtracted] = useState(() => localStorage.getItem(EXTRACTED_KEY) === 'true')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const markExtracted = useCallback(() => {
    localStorage.setItem(EXTRACTED_KEY, 'true')
    setHasExtracted(true)
  }, [])

  const install = useCallback(async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setDismissed(true)
  }, [deferredPrompt])

  const dismiss = useCallback(() => setDismissed(true), [])

  return {
    showInstallBanner: hasExtracted && deferredPrompt != null && !dismissed,
    markExtracted,
    install,
    dismiss,
  }
}
