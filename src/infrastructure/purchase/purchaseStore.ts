const KEYS = {
  email: 'mise_purchase_email',
  paid: 'mise_purchase_paid',
  verifiedAt: 'mise_purchase_verified_at',
} as const

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export interface PurchaseStatus {
  email: string | null
  paid: boolean
  verifiedAt: string | null
}

export function getPurchaseStatus(): PurchaseStatus {
  return {
    email: localStorage.getItem(KEYS.email),
    paid: localStorage.getItem(KEYS.paid) === 'true',
    verifiedAt: localStorage.getItem(KEYS.verifiedAt),
  }
}

export function savePurchaseStatus(email: string, paid: boolean): void {
  localStorage.setItem(KEYS.email, email)
  localStorage.setItem(KEYS.paid, String(paid))
  localStorage.setItem(KEYS.verifiedAt, new Date().toISOString())
}

export function clearPurchaseStatus(): void {
  localStorage.removeItem(KEYS.email)
  localStorage.removeItem(KEYS.paid)
  localStorage.removeItem(KEYS.verifiedAt)
}

export function isVerificationStale(): boolean {
  const verifiedAt = localStorage.getItem(KEYS.verifiedAt)
  if (!verifiedAt) return true
  const elapsed = Date.now() - new Date(verifiedAt).getTime()
  return elapsed > CACHE_TTL_MS
}
