import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { ALLOWED_ORIGINS } from './_lib/cors.js'
import { enforceRateLimit } from './_lib/rateLimit.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Creating a Stripe Checkout session is a rare, human-paced action. Without a
  // limit this can be scripted to mass-create sessions — cost, noise, and a
  // fraud signal on the Stripe account.
  const allowed = await enforceRateLimit(req, res, {
    name: 'create-checkout',
    limit: 10,
    windowSec: 600,
    dailyGlobalLimit: 500,
  })
  if (!allowed) return

  const secretKey = process.env.STRIPE_SECRET_KEY
  const priceId = process.env.STRIPE_PRICE_ID
  if (!secretKey || !priceId) {
    return res.status(500).json({ error: 'Stripe not configured on server' })
  }

  const { successUrl, cancelUrl } = req.body ?? {}
  if (!successUrl || !cancelUrl) {
    return res.status(400).json({ error: 'successUrl and cancelUrl are required' })
  }

  // CWE-601: Validate redirect URLs against allowed origins
  const isAllowed = (url: string) => {
    try {
      return ALLOWED_ORIGINS.includes(new URL(url).origin)
    } catch {
      return false
    }
  }
  if (!isAllowed(successUrl) || !isAllowed(cancelUrl)) {
    return res.status(400).json({ error: 'Redirect URLs must point to mise.swinch.dev' })
  }

  try {
    const stripe = new Stripe(secretKey)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('create-checkout: Stripe error', err)
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' })
  }
}
