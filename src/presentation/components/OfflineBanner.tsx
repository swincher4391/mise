import { useOnlineStatus } from '@presentation/hooks/useOnlineStatus.ts'

/**
 * A small fixed banner shown only while the browser is offline. Saved recipes
 * and cooking mode work offline; extraction, Discover, and Instacart don't —
 * this tells the user why a network action isn't available rather than letting
 * it fail silently.
 */
export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      You're offline — saved recipes still work, but adding new ones needs a connection.
    </div>
  )
}
