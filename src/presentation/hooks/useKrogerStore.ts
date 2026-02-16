import { useState, useEffect, useCallback } from 'react'
import { checkKrogerAuth, logoutKroger } from '@infrastructure/kroger/krogerTokenStore.ts'
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

  const [isConnected, setIsConnected] = useState<boolean | null>(null)

  // Check auth status via server-side cookie on mount
  useEffect(() => {
    checkKrogerAuth().then(setIsConnected)
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

  const disconnectKroger = useCallback(async () => {
    await logoutKroger()
    setIsConnected(false)
  }, [])

  return {
    selectedStore,
    isConnected,
    selectStore,
    clearStore,
    connectKroger,
    disconnectKroger,
  }
}
