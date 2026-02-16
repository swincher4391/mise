import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'

// In-memory rate limiting for PIN attempts (resets on cold start)
const failedAttempts = new Map<string, { count: number; resetAt: number }>()
const MAX_PIN_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes

function checkRateLimit(email: string): boolean {
  const key = email.toLowerCase()
  const entry = failedAttempts.get(key)
  if (!entry) return true
  if (Date.now() > entry.resetAt) {
    failedAttempts.delete(key)
    return true
  }
  return entry.count < MAX_PIN_ATTEMPTS
}

function recordFailedAttempt(email: string): void {
  const key = email.toLowerCase()
  const entry = failedAttempts.get(key)
  if (!entry || Date.now() > entry.resetAt) {
    failedAttempts.set(key, { count: 1, resetAt: Date.now() + LOCKOUT_MS })
  } else {
    entry.count++
  }
}

function clearFailedAttempts(email: string): void {
  failedAttempts.delete(email.toLowerCase())
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const sessionId = req.query.sessionId as string | undefined
  const email = req.query.email as string | undefined

  if (!sessionId && !email) {
    return res.status(400).json({ error: 'sessionId or email is required' })
  }

  // Validate email format
  if (email && !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' })
  }

  // Comped users — bypass Stripe entirely (format: "email:pin,email:pin")
  const pin = req.query.pin as string | undefined
  const compedEntries = (process.env.COMPED_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  if (email) {
    for (const entry of compedEntries) {
      const [compEmail, compPin] = entry.split(':')
      if (compEmail.toLowerCase() === email.toLowerCase()) {
        if (!pin) return res.status(200).json({ paid: false, needsPin: true, email })

        // Rate limit PIN attempts
        if (!checkRateLimit(email)) {
          return res.status(429).json({ error: 'Too many PIN attempts. Try again later.' })
        }

        if (pin === compPin) {
          clearFailedAttempts(email)
          return res.status(200).json({ paid: true, email })
        }

        recordFailedAttempt(email)
        return res.status(200).json({ paid: false, email })
      }
    }
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe not configured on server' })
  }

  try {
    const stripe = new Stripe(secretKey)

    // Verify by Checkout Session ID (post-payment redirect)
    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId)
      const customerEmail = session.customer_details?.email ?? session.customer_email
      const paid = session.payment_status === 'paid'
      return res.status(200).json({ paid, email: customerEmail ?? '' })
    }

    // Verify by email (restore purchase / cache refresh)
    const customers = await stripe.customers.list({ email: email!, limit: 1 })
    if (customers.data.length === 0) {
      return res.status(200).json({ paid: false, email })
    }

    const customer = customers.data[0]
    const payments = await stripe.paymentIntents.list({
      customer: customer.id,
      limit: 1,
    })

    const hasPaid = payments.data.some((pi) => pi.status === 'succeeded')
    return res.status(200).json({ paid: hasPaid, email })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: `Verification failed: ${message}` })
  }
}
