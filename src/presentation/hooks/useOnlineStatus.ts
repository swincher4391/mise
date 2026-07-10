import { useEffect, useState } from 'react'

/**
 * Tracks connectivity via the browser's online/offline events.
 *
 * Mise's own marketing scenario is a user in a grocery store with bad signal —
 * exactly where a silent network failure is most confusing. Components use this
 * to show an offline banner and disable network-dependent actions with an
 * explanation instead of failing quietly.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
