import { useState, useEffect, useCallback } from 'react'
import {
  saveKrogerTokens,
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

  // Check for OAuth2 callback tokens in URL hash on mount
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('kroger_access_token')) {
      const params = new URLSearchParams(hash.slice(1))
      const accessToken = params.get('kroger_access_token')
      const refreshToken = params.get('kroger_refresh_token') ?? ''
      const expiresIn = Number(params.get('kroger_expires_in') || '1800')
      if (accessToken) {
        saveKrogerTokens(accessToken, refreshToken, expiresIn)
        setIsConnected(true)
        // Clean up the hash
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
  }, [])

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
