import { useState, useRef, useCallback, useEffect } from 'react'

export interface UseWakeLockResult {
  isSupported: boolean
  isActive: boolean
  request: () => Promise<void>
  release: () => Promise<void>
}

export function useWakeLock(): UseWakeLockResult {
  const isSupported = 'wakeLock' in navigator
  const [isActive, setIsActive] = useState(false)
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  const request = useCallback(async () => {
    if (!isSupported) return
    try {
      sentinelRef.current = await navigator.wakeLock.request('screen')
      setIsActive(true)
      sentinelRef.current.addEventListener('release', () => {
        setIsActive(false)
        sentinelRef.current = null
      })
    } catch {
      // Wake lock request failed (e.g. low battery)
      setIsActive(false)
    }
  }, [isSupported])

  const release = useCallback(async () => {
    if (sentinelRef.current) {
      await sentinelRef.current.release()
      sentinelRef.current = null
      setIsActive(false)
    }
  }, [])

  // Re-request wake lock when tab becomes visible again
  useEffect(() => {
    if (!isSupported) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !sentinelRef.current) {
        // Only re-request if we previously had it active
        request()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [isSupported, request])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sentinelRef.current) {
        sentinelRef.current.release()
        sentinelRef.current = null
      }
    }
  }, [])

  return { isSupported, isActive, request, release }
}
