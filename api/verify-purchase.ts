import type { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'

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

  // Comped users — bypass Stripe entirely (format: "email:pin,email:pin")
  const pin = req.query.pin as string | undefined
  const compedEntries = (process.env.COMPED_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  if (email) {
    for (const entry of compedEntries) {
      const [compEmail, compPin] = entry.split(':')
      if (compEmail.toLowerCase() === email.toLowerCase()) {
        if (!pin) return res.status(200).json({ paid: false, needsPin: true, email })
        if (pin === compPin) return res.status(200).json({ paid: true, email })
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
