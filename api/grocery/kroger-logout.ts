import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearTokenCookie } from '../_lib/cookies.js'
import { setAuthenticatedCors } from '../_lib/cors.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setAuthenticatedCors(req, res)

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  clearTokenCookie(res)
  return res.status(200).json({ ok: true })
}
