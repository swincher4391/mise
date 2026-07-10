import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import Stripe from 'stripe'
import { setPublicCors } from './_lib/cors.js'
import { enforceRateLimit, failureCount, recordFailure, clearFailures } from './_lib/rateLimit.js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MAX_PIN_ATTEMPTS = 5
const PIN_LOCKOUT_SEC = 15 * 60

/**
 * Length-independent constant-time comparison. `timingSafeEqual` throws on
 * length mismatch, which would itself leak the PIN's length.
 */
function pinMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length) {
    // Still burn a comparison so the timing doesn't depend on length.
    timingSafeEqual(a, a)
    return false
  }
  return timingSafeEqual(a, b)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setPublicCors(res)

  if (req.method === 'OPTIONS') return res.status(204).end()

  // Accept both GET (legacy/session_id) and POST (email/pin verification)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Per-IP throttle on top of the per-email PIN lockout below. Unthrottled,
  // the email path is an enumeration oracle (which emails have purchased) and
  // the session path hits Stripe on every call.
  const allowed = await enforceRateLimit(req, res, {
    name: 'verify-purchase',
    limit: 20,
    windowSec: 600,
    dailyGlobalLimit: 2000,
  })
  if (!allowed) return

  // GET: only for session_id verification (Stripe redirect)
  // POST: for email/pin verification (keeps sensitive data out of URLs/logs)
  const isPost = req.method === 'POST'
  const sessionId = isPost ? req.body?.sessionId : req.query.sessionId as string | undefined
  const email = isPost ? req.body?.email : req.query.email as string | undefined

  if (!sessionId && !email) {
    return res.status(400).json({ error: 'sessionId or email is required' })
  }

  // Validate email format
  if (email && !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' })
  }

  // Comped users — bypass Stripe entirely (format: "email:pin,email:pin")
  const pin = isPost ? req.body?.pin : req.query.pin as string | undefined
  const compedEntries = (process.env.COMPED_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  if (email) {
    for (const entry of compedEntries) {
      const [compEmail, compPin] = entry.split(':')
      if (compEmail.toLowerCase() === email.toLowerCase()) {
        // Must be a string: a JSON number or object would throw inside
        // Buffer.from below, and this branch sits outside the try/catch.
        if (typeof pin !== 'string' || !pin) {
          return res.status(200).json({ paid: false, needsPin: true, email })
        }

        // The PIN is the only credential guarding a comped account, so the
        // attempt counter must be shared across serverless instances — an
        // in-memory map gives an attacker a fresh budget per warm lambda.
        const subject = email.toLowerCase()
        if ((await failureCount('pin', subject)) >= MAX_PIN_ATTEMPTS) {
          return res.status(429).json({ error: 'Too many PIN attempts. Try again later.' })
        }

        if (pinMatches(pin, compPin ?? '')) {
          await clearFailures('pin', subject)
          return res.status(200).json({ paid: true, email })
        }

        await recordFailure('pin', subject, PIN_LOCKOUT_SEC)
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
    console.error('verify-purchase: Stripe error', err)
    return res.status(500).json({ error: 'Verification failed. Please try again.' })
  }
}
