import { savePurchaseStatus } from './purchaseStore.ts'

interface VerifyResponse {
  paid: boolean
  email: string
  needsPin?: boolean
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

export interface VerifyResult {
  paid: boolean
  needsPin?: boolean
}

export async function verifyAndCache(email: string, pin?: string): Promise<VerifyResult> {
  let url = `/api/verify-purchase?email=${encodeURIComponent(email)}`
  if (pin) url += `&pin=${encodeURIComponent(pin)}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error('Failed to verify purchase')
  }
  const data: VerifyResponse = await res.json()
  if (data.paid) savePurchaseStatus(data.email, true)
  return { paid: data.paid, needsPin: data.needsPin }
}
