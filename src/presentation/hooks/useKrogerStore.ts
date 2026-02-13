import { useState, useCallback } from 'react'
import {
  getKrogerAccessToken,
  clearKrogerTokens,
  hasKrogerTokens,
} from '@infrastructure/kroger/krogerTokenStore.ts'
import { getAuthorizeUrl } from '@infrastructure/kroger/krogerApi.ts'

const STORE_KEY = 'kroger_selected_store'

interface SelectedStore {
  locationId: string
  name: string
  address: string
}

export function useKrogerStore() {
  const [selectedStore, setSelectedStore] = useState<SelectedStore | null>(() => {
    const saved = localStorage.getItem(STORE_KEY)
    return saved ? JSON.parse(saved) : null
  })

  const [isConnected, setIsConnected] = useState(() => {
    return getKrogerAccessToken() !== null
  })

  // Token parsing from URL hash is handled synchronously in krogerTokenStore.ts
  // on module load, before React renders. No useEffect needed here.

  const selectStore = useCallback((store: SelectedStore) => {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
    setSelectedStore(store)
  }, [])

  const clearStore = useCallback(() => {
    localStorage.removeItem(STORE_KEY)
    setSelectedStore(null)
  }, [])

  const connectKroger = useCallback(() => {
    window.location.href = getAuthorizeUrl()
  }, [])

  const disconnectKroger = useCallback(() => {
    clearKrogerTokens()
    setIsConnected(false)
  }, [])

  const getAccessToken = useCallback((): string | null => {
    const token = getKrogerAccessToken()
    if (!token && hasKrogerTokens()) {
      // Token expired — update state
      setIsConnected(false)
    }
    return token
  }, [])

  return {
    selectedStore,
    isConnected,
    selectStore,
    clearStore,
    connectKroger,
    disconnectKroger,
    getAccessToken,
  }
}
