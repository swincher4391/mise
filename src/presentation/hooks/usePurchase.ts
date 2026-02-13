import { useState, useEffect, useCallback } from 'react'
import { getPurchaseStatus, isVerificationStale } from '@infrastructure/purchase/purchaseStore.ts'
import { verifyAndCache, verifyBySessionId } from '@infrastructure/purchase/verifyPurchase.ts'

const FREE_RECIPE_LIMIT = 25

export interface PurchaseState {
  isPaid: boolean
  isLoading: boolean
  email: string | null
  upgrade: () => void
  restore: (email: string) => Promise<boolean>
}

export function usePurchase(): PurchaseState {
  const [isPaid, setIsPaid] = useState(() => getPurchaseStatus().paid)
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState(() => getPurchaseStatus().email)

  // On mount: check for session_id in URL (Stripe redirect) or re-verify stale cache
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')

    if (sessionId) {
      setIsLoading(true)
      verifyBySessionId(sessionId)
        .then((result) => {
          setIsPaid(result.paid)
          setEmail(result.email)
          // Clean URL
          const url = new URL(window.location.href)
          url.searchParams.delete('session_id')
          window.history.replaceState({}, '', url.pathname + url.search + url.hash)
        })
        .catch(console.error)
        .finally(() => setIsLoading(false))
      return
    }

    // Re-verify if cache is stale
    const status = getPurchaseStatus()
    if (status.email && isVerificationStale()) {
      setIsLoading(true)
      verifyAndCache(status.email)
        .then((paid) => {
          setIsPaid(paid)
          setEmail(status.email)
        })
        .catch(console.error)
        .finally(() => setIsLoading(false))
    }
  }, [])

  const upgrade = useCallback(async () => {
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          successUrl: window.location.origin + '/?session_id={CHECKOUT_SESSION_ID}',
          cancelUrl: window.location.href,
        }),
      })
      if (!res.ok) throw new Error('Failed to create checkout session')
      const { url } = await res.json()
      window.location.href = url
    } catch (err) {
      console.error('Checkout error:', err)
    }
  }, [])

  const restore = useCallback(async (restoreEmail: string): Promise<boolean> => {
    setIsLoading(true)
    try {
      const paid = await verifyAndCache(restoreEmail)
      setIsPaid(paid)
      setEmail(restoreEmail)
      return paid
    } catch {
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { isPaid, isLoading, email, upgrade, restore }
}

export { FREE_RECIPE_LIMIT }
