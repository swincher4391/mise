import { savePurchaseStatus } from './purchaseStore.ts'

interface VerifyResponse {
  paid: boolean
  email: string
}

export async function verifyBySessionId(sessionId: string): Promise<VerifyResponse> {
  const res = await fetch(`/api/verify-purchase?sessionId=${encodeURIComponent(sessionId)}`)
  if (!res.ok) {
    throw new Error('Failed to verify purchase')
  }
  const data: VerifyResponse = await res.json()
  savePurchaseStatus(data.email, data.paid)
  return data
}

export async function verifyAndCache(email: string): Promise<boolean> {
  const res = await fetch(`/api/verify-purchase?email=${encodeURIComponent(email)}`)
  if (!res.ok) {
    throw new Error('Failed to verify purchase')
  }
  const data: VerifyResponse = await res.json()
  savePurchaseStatus(data.email, data.paid)
  return data.paid
}
