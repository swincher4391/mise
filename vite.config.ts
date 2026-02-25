import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

function imageExtractPlugin(): Plugin {
  return {
    name: 'image-extract-proxy',
    configureServer(server) {
      // Load all env vars (including non-VITE_ prefixed) from .env files
      const env = loadEnv('development', process.cwd(), '')

      server.middlewares.use('/api/extract-image', (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          })
          res.end()
          return
        }

        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        req.on('end', async () => {
          const apiKey = env.HF_API_KEY
          if (!apiKey) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'HF_API_KEY not configured. Add it to .env file.' }))
            return
          }

          let parsed: { image?: string }
          try {
            parsed = JSON.parse(body)
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid JSON body' }))
            return
          }

          if (!parsed.image || typeof parsed.image !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing image field' }))
            return
          }

          const maxSize = 5 * 1024 * 1024
          const estimatedBytes = (parsed.image.length * 3) / 4
          if (estimatedBytes > maxSize) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Image exceeds 5MB limit' }))
            return
          }

          const prompt = `Extract the recipe from this image. Return ONLY valid JSON with this structure:
{
  "title": "Recipe Name",
  "ingredients": ["1 cup flour", "2 eggs"],
  "steps": ["Preheat oven to 350F", "Mix dry ingredients"],
  "servings": "4" or null,
  "prepTime": "15 min" or null,
  "cookTime": "30 min" or null
}
If this is not a recipe image, return: {"error": "No recipe found in image"}`

          try {
            // Upload base64 to temp host — HF Hyperbolic requires a URL, not inline base64
            const base64Data = parsed.image.replace(/^data:image\/\w+;base64,/, '')
            const buffer = Buffer.from(base64Data, 'base64')
            const contentType = parsed.image.match(/^data:(image\/\w+);/)?.[1] ?? 'image/png'
            const ext = contentType.split('/')[1] ?? 'png'

            const boundary = '----MiseBoundary' + Date.now()
            const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recipe.${ext}"\r\nContent-Type: ${contentType}\r\n\r\n`
            const footer = `\r\n--${boundary}--\r\n`
            const uploadBody = Buffer.concat([
              Buffer.from(header, 'utf-8'),
              buffer,
              Buffer.from(footer, 'utf-8'),
            ])

            const uploadRes = await fetch('https://tmpfiles.org/api/v1/upload', {
              method: 'POST',
              headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
              body: uploadBody,
            })

            if (!uploadRes.ok) {
              res.writeHead(502, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              })
              res.end(JSON.stringify({ error: `Image upload failed (${uploadRes.status})` }))
              return
            }

            const uploadData: any = await uploadRes.json()
            const imageUrl: string = (uploadData?.data?.url ?? '').replace('tmpfiles.org/', 'tmpfiles.org/dl/')

            const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'Qwen/Qwen2.5-VL-7B-Instruct:hyperbolic',
                messages: [
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: prompt },
                      { type: 'image_url', image_url: { url: imageUrl } },
                    ],
                  },
                ],
                max_tokens: 2048,
              }),
            })

            if (!response.ok) {
              const errorText = await response.text()
              res.writeHead(502, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              })
              res.end(
                JSON.stringify({
                  error: `HF API error (${response.status}): ${errorText.slice(0, 200)}`,
                })
              )
              return
            }

            const data: any = await response.json()
            const content: string = data.choices?.[0]?.message?.content ?? ''
            const jsonMatch = content.match(/\{[\s\S]*\}/)
            if (!jsonMatch) {
              res.writeHead(502, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              })
              res.end(JSON.stringify({ error: 'No JSON found in model response' }))
              return
            }

            const result = JSON.parse(jsonMatch[0])
            res.writeHead(200, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            })
            res.end(JSON.stringify(result))
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error'
            res.writeHead(502, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            })
            res.end(JSON.stringify({ error: `Failed to extract recipe: ${message}` }))
          }
        })
      })
    },
  }
}

function instacartPlugin(): Plugin {
  function jsonResponse(res: any, status: number, body: any) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(JSON.stringify(body))
  }

  function readBody(req: any): Promise<string> {
    return new Promise((resolve) => {
      let body = ''
      req.on('data', (chunk: Buffer) => { body += chunk.toString() })
      req.on('end', () => resolve(body))
    })
  }

  return {
    name: 'instacart-proxy',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '')
      const apiKey = env.INSTACART_API_KEY
      const baseUrl = env.INSTACART_API_URL ?? 'https://connect.instacart.com'

      // Shopping list endpoint
      server.middlewares.use('/api/grocery/instacart-shopping-list', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' })
          return res.end()
        }
        if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' })
        if (!apiKey) return jsonResponse(res, 500, { error: 'INSTACART_API_KEY not configured' })

        try {
          const body = JSON.parse(await readBody(req))
          if (!Array.isArray(body.line_items) || body.line_items.length === 0) {
            return jsonResponse(res, 400, { error: 'line_items array is required' })
          }

          const response = await fetch(`${baseUrl}/idp/v1/products/products_link`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: body.title ?? 'Shopping List',
              line_items: body.line_items,
              landing_page_configuration: body.landing_page_configuration,
            }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            return jsonResponse(res, response.status, { error: `Instacart API error (${response.status}): ${errorText.slice(0, 200)}` })
          }

          const data: any = await response.json()
          jsonResponse(res, 200, { url: data.products_link_url })
        } catch (err: any) {
          jsonResponse(res, 502, { error: err.message })
        }
      })

      // Recipe endpoint
      server.middlewares.use('/api/grocery/instacart-recipe', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' })
          return res.end()
        }
        if (req.method !== 'POST') return jsonResponse(res, 405, { error: 'Method not allowed' })
        if (!apiKey) return jsonResponse(res, 500, { error: 'INSTACART_API_KEY not configured' })

        try {
          const body = JSON.parse(await readBody(req))
          if (!body.title || !Array.isArray(body.ingredients) || body.ingredients.length === 0) {
            return jsonResponse(res, 400, { error: 'title and ingredients array are required' })
          }

          const response = await fetch(`${baseUrl}/idp/v1/products/recipe`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
          })

          if (!response.ok) {
            const errorText = await response.text()
            return jsonResponse(res, response.status, { error: `Instacart API error (${response.status}): ${errorText.slice(0, 200)}` })
          }

          const data: any = await response.json()
          jsonResponse(res, 200, { url: data.products_link_url })
        } catch (err: any) {
          jsonResponse(res, 502, { error: err.message })
        }
      })
    },
  }
}

function stripePlugin(): Plugin {
  return {
    name: 'stripe-proxy',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '')

      function readBody(req: any): Promise<string> {
        return new Promise((resolve) => {
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', () => resolve(body))
        })
      }

      function jsonRes(res: any, status: number, data: any) {
        res.writeHead(status, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        })
        res.end(JSON.stringify(data))
      }

      // POST /api/create-checkout
      server.middlewares.use('/api/create-checkout', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' })
          return res.end()
        }
        if (req.method !== 'POST') return jsonRes(res, 405, { error: 'Method not allowed' })

        const secretKey = env.STRIPE_SECRET_KEY
        const priceId = env.STRIPE_PRICE_ID
        if (!secretKey || !priceId) return jsonRes(res, 500, { error: 'Stripe not configured. Add STRIPE_SECRET_KEY and STRIPE_PRICE_ID to .env' })

        try {
          const { successUrl, cancelUrl } = JSON.parse(await readBody(req))
          if (!successUrl || !cancelUrl) return jsonRes(res, 400, { error: 'successUrl and cancelUrl are required' })

          const { default: Stripe } = await import('stripe')
          const stripe = new Stripe(secretKey)
          const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: successUrl,
            cancel_url: cancelUrl,
            allow_promotion_codes: true,
          })
          jsonRes(res, 200, { url: session.url })
        } catch (err: any) {
          jsonRes(res, 500, { error: err.message })
        }
      })

      // GET /api/verify-purchase
      server.middlewares.use('/api/verify-purchase', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' })
          return res.end()
        }
        if (req.method !== 'GET') return jsonRes(res, 405, { error: 'Method not allowed' })

        const secretKey = env.STRIPE_SECRET_KEY
        if (!secretKey) return jsonRes(res, 500, { error: 'STRIPE_SECRET_KEY not configured' })

        const url = new URL(req.url!, `http://${req.headers.host}`)
        const sessionId = url.searchParams.get('sessionId')
        const email = url.searchParams.get('email')
        if (!sessionId && !email) return jsonRes(res, 400, { error: 'sessionId or email is required' })

        // Comped users — bypass Stripe (format: "email:pin,email:pin")
        const pin = url.searchParams.get('pin')
        const compedEntries = (env.COMPED_EMAILS ?? '').split(',').map((e: string) => e.trim()).filter(Boolean)
        if (email) {
          for (const entry of compedEntries) {
            const [compEmail, compPin] = entry.split(':')
            if (compEmail.toLowerCase() === email.toLowerCase()) {
              if (!pin) return jsonRes(res, 200, { paid: false, needsPin: true, email })
              if (pin === compPin) return jsonRes(res, 200, { paid: true, email })
              return jsonRes(res, 200, { paid: false, email })
            }
          }
        }

        try {
          const { default: Stripe } = await import('stripe')
          const stripe = new Stripe(secretKey)

          if (sessionId) {
            const session = await stripe.checkout.sessions.retrieve(sessionId)
            const customerEmail = session.customer_details?.email ?? session.customer_email
            const paid = session.payment_status === 'paid'
            return jsonRes(res, 200, { paid, email: customerEmail ?? '' })
          }

          const customers = await stripe.customers.list({ email: email!, limit: 1 })
          if (customers.data.length === 0) return jsonRes(res, 200, { paid: false, email })

          const customer = customers.data[0]
          const payments = await stripe.paymentIntents.list({ customer: customer.id, limit: 1 })
          const hasPaid = payments.data.some((pi) => pi.status === 'succeeded')
          jsonRes(res, 200, { paid: hasPaid, email })
        } catch (err: any) {
          jsonRes(res, 500, { error: err.message })
        }
      })
    },
  }
}

function browserProxyPlugin(): Plugin {
  return {
    name: 'browser-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy-browser', async (req, res) => {
        const reqUrl = new URL(req.url!, `http://${req.headers.host}`)
        const targetUrl = reqUrl.searchParams.get('url')
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing ?url= parameter' }))
          return
        }

        if (isBlockedUrl(targetUrl)) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'URL not allowed' }))
          return
        }

        try {
          const puppeteerExtra = await import('puppeteer-extra')
          const StealthPlugin = await import('puppeteer-extra-plugin-stealth')
          puppeteerExtra.default.use(StealthPlugin.default())

          // Auto-detect Chrome path on common platforms
          const chromePath =
            process.env.CHROME_PATH ||
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

          const browser = await puppeteerExtra.default.launch({
            headless: 'new',
            executablePath: chromePath,
            args: [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-blink-features=AutomationControlled',
              '--window-size=1920,1080',
            ],
          })

          try {
            const page = await browser.newPage()
            await page.setViewport({ width: 1920, height: 1080 })

            // Navigate and wait for full load
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

            // Wait for either JSON-LD or main content to appear
            await page.waitForFunction(
              `document.querySelector('script[type="application/ld+json"]') !== null
               || document.body.innerText.length > 1000`,
              { timeout: 15000 }
            ).catch(() => {})

            const html = String(await page.evaluate('document.documentElement.outerHTML'))

            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
            })
            res.end(html)
          } finally {
            await browser.close().catch(() => {})
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Browser fetch failed: ${message}` }))
        }
      })
    },
  }
}

function isBlockedUrl(raw: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return true
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true
  const hostname = parsed.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const ipPatterns = [
    /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./, /^169\.254\./, /^0\./,
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  ]
  if (ipPatterns.some((p) => p.test(hostname))) return true
  if (['metadata.google.internal', 'metadata.google', 'instance-data'].includes(hostname)) return true
  return false
}

function recipeChatPlugin(): Plugin {
  return {
    name: 'recipe-chat-proxy',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '')

      server.middlewares.use('/api/recipe-chat', (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          })
          res.end()
          return
        }

        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        let body = ''
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString()
        })
        req.on('end', async () => {
          const apiKey = env.HF_API_KEY
          if (!apiKey) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'HF_API_KEY not configured. Add it to .env file.' }))
            return
          }

          let parsed: { messages?: Array<{ role: string; content: string }> }
          try {
            parsed = JSON.parse(body)
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid JSON body' }))
            return
          }

          if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing messages array' }))
            return
          }

          const systemPrompt = `You are a skilled home cook and recipe developer for Mise, a recipe app. Help users create delicious, well-tested recipes through conversation.

Conversation guidelines:
- Ask clarifying questions about cuisine preferences, dietary restrictions, serving size, and skill level
- Strictly respect dietary restrictions mentioned at any point (vegetarian, vegan, gluten-free, etc.) — never suggest ingredients that violate them
- Suggest ingredient substitutions when asked
- Keep responses concise and conversational
- Do NOT write out a full recipe during conversation. Discuss ideas, suggest directions, and refine — save the structured recipe for the finalize step.

Recipe quality standards (apply these when generating the final recipe):
- Write recipes from scratch — never rely on store-bought shortcuts like frozen meatballs, canned soup, or jarred sauce unless the user specifically asks for a shortcut version
- Use realistic quantities that match the serving count (e.g., 4 servings of meatballs needs ~16-20 meatballs, not 4)
- Include proper seasoning — salt, pepper, herbs, spices. Bland recipes are bad recipes.
- Write clear, detailed steps. Each step should be one logical action. Avoid cramming multiple techniques into a single step.
- Include sensory cues: "until golden brown", "until onions are translucent", "until internal temp reaches 165F"
- Ingredients should be listed in the order they're used, with prep notes (diced, minced, etc.)
- Prep and cook times should be realistic for the steps described

When the user explicitly asks to finalize or build the recipe, output ONLY a \`\`\`recipe-json code block with no other text before or after it.

The recipe-json block must contain valid JSON with this exact structure:
\`\`\`recipe-json
{
  "title": "Recipe Name",
  "ingredients": ["2 cups all-purpose flour", "3 large eggs, beaten"],
  "steps": ["Preheat oven to 375°F.", "In a large bowl, combine flour and salt.", "Add eggs and mix until a shaggy dough forms."],
  "servings": "4",
  "prepTime": "20 min",
  "cookTime": "35 min"
}
\`\`\`

IMPORTANT: Never include the recipe-json block unless the user explicitly asks to finalize. During conversation, only discuss the recipe in plain text.`

          const recentMessages = parsed.messages.slice(-10)
          const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...recentMessages,
          ]

          try {
            const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'Qwen/Qwen3-14B',
                messages: fullMessages,
                max_tokens: 2048,
                temperature: 0.7,
                stream: true,
              }),
            })

            if (!response.ok) {
              const errorText = await response.text()
              res.writeHead(502, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
              })
              res.write(`data: ${JSON.stringify({ error: `HF API error (${response.status}): ${errorText.slice(0, 200)}` })}\n\n`)
              res.write('data: [DONE]\n\n')
              res.end()
              return
            }

            // Stream SSE response
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Access-Control-Allow-Origin': '*',
            })

            const reader = (response.body as any).getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''

              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed || !trimmed.startsWith('data: ')) continue

                const data = trimmed.slice(6)
                if (data === '[DONE]') {
                  res.write('data: [DONE]\n\n')
                  continue
                }

                try {
                  const chunk = JSON.parse(data)
                  const content = chunk.choices?.[0]?.delta?.content
                  if (content) {
                    res.write(`data: ${JSON.stringify({ content })}\n\n`)
                  }
                } catch {
                  // skip unparseable
                }
              }
            }

            res.write('data: [DONE]\n\n')
            res.end()
          } catch (err: any) {
            res.writeHead(502, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Access-Control-Allow-Origin': '*',
            })
            res.write(`data: ${JSON.stringify({ error: `Chat failed: ${err.message}` })}\n\n`)
            res.write('data: [DONE]\n\n')
            res.end()
          }
        })
      })
    },
  }
}

function recipeImageSearchPlugin(): Plugin {
  return {
    name: 'recipe-image-search-proxy',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '')

      server.middlewares.use('/api/recipe-image-search', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')

        if (req.method === 'OPTIONS') {
          res.writeHead(204)
          res.end()
          return
        }

        const apiKey = env.UNSPLASH_ACCESS_KEY
        if (!apiKey) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ imageUrl: null }))
          return
        }

        const reqUrl = new URL(req.url!, `http://${req.headers.host}`)
        const query = reqUrl.searchParams.get('q')
        if (!query) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing ?q= parameter' }))
          return
        }

        try {
          const params = new URLSearchParams({
            query: `${query} food`,
            per_page: '1',
            orientation: 'landscape',
          })

          const response = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
            headers: { Authorization: `Client-ID ${apiKey}` },
          })

          if (!response.ok) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ imageUrl: null }))
            return
          }

          const data: any = await response.json()
          const photo = data.results?.[0]

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({
            imageUrl: photo?.urls?.regular ?? null,
            credit: photo ? {
              name: photo.user?.name ?? null,
              link: photo.user?.links?.html ?? null,
            } : null,
          }))
        } catch {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ imageUrl: null }))
        }
      })
    },
  }
}

async function enrichResults(
  results: Array<{ title: string; sourceUrl: string; sourceName: string; description: string; image: string | null; rating: number | null; ratingCount: number | null }>
) {
  const enriched = await Promise.allSettled(
    results.map(async (r) => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      try {
        const res = await fetch(r.sourceUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html',
          },
          redirect: 'follow',
        })
        // Read only first 100KB to find JSON-LD quickly
        const text = await res.text()
        const chunk = text.slice(0, 100_000)

        // Extract all JSON-LD blocks
        const ldBlocks = [...chunk.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
        for (const match of ldBlocks) {
          try {
            const ld = JSON.parse(match[1])
            const recipes = Array.isArray(ld) ? ld : ld['@graph'] ? ld['@graph'] : [ld]
            for (const item of recipes) {
              if (item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
                // Image
                if (!r.image && item.image) {
                  const img = Array.isArray(item.image) ? item.image[0] : item.image
                  r.image = typeof img === 'string' ? img : img?.url ?? null
                }
                // Rating
                if (item.aggregateRating) {
                  const ar = item.aggregateRating
                  r.rating = parseFloat(ar.ratingValue) || null
                  r.ratingCount = parseInt(ar.ratingCount || ar.reviewCount, 10) || null
                }
                break
              }
            }
          } catch { /* skip bad JSON-LD */ }
        }

        // Fallback: og:image if no recipe image found
        if (!r.image) {
          const ogMatch = chunk.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)
            ?? chunk.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
          if (ogMatch) r.image = ogMatch[1]
        }
      } catch { /* timeout or fetch error — leave defaults */ } finally {
        clearTimeout(timeout)
      }
      return r
    })
  )

  return enriched.map((r, i) => r.status === 'fulfilled' ? r.value : results[i])
}

function parseDdgResults(html: string) {
  const results: Array<{
    title: string
    sourceUrl: string
    sourceName: string
    description: string
    image: string | null
    rating: number | null
    ratingCount: number | null
  }> = []

  // Split on result blocks — each organic result is in a div.result
  const blocks = html.split(/class="result\s/)
  for (const block of blocks.slice(1)) {
    // Skip ads
    if (block.includes('result--ad')) continue

    // Extract title + href from result__a link
    const titleMatch = block.match(/class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/)
    if (!titleMatch) continue

    const rawHref = titleMatch[1]
    const rawTitle = titleMatch[2].replace(/<[^>]*>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
    if (!rawTitle) continue

    // Extract actual URL from DDG redirect
    let sourceUrl: string
    const uddgMatch = rawHref.match(/uddg=([^&]+)/)
    if (uddgMatch) {
      sourceUrl = decodeURIComponent(uddgMatch[1])
    } else if (rawHref.startsWith('http')) {
      sourceUrl = rawHref
    } else {
      continue
    }

    // Extract snippet
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
    const description = snippetMatch
      ? snippetMatch[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, 200)
      : ''

    // Extract source name from displayed URL
    const urlMatch = block.match(/class="result__url"[^>]*>([\s\S]*?)</)
    const sourceName = urlMatch
      ? urlMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, '').split('/')[0]
      : new URL(sourceUrl).hostname.replace(/^www\./, '')

    results.push({ title: rawTitle, sourceUrl, sourceName, description, image: null, rating: null, ratingCount: null })
    if (results.length >= 12) break
  }

  return results
}

function recipeDiscoverPlugin(): Plugin {
  return {
    name: 'recipe-discover-proxy',
    configureServer(server) {
      server.middlewares.use('/api/recipe-discover', async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*')

        if (req.method === 'OPTIONS') {
          res.writeHead(204)
          res.end()
          return
        }

        const reqUrl = new URL(req.url!, `http://${req.headers.host}`)
        const query = reqUrl.searchParams.get('q')
        if (!query) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing ?q= parameter' }))
          return
        }

        try {
          const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' recipe')}`
          const response = await fetch(searchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            },
          })

          if (!response.ok) {
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `Search failed (${response.status})` }))
            return
          }

          const html = await response.text()
          const results = parseDdgResults(html)
          const enriched = await enrichResults(results)

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ results: enriched }))
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: `Recipe search failed: ${message}` }))
        }
      })
    },
  }
}

function corsProxyPlugin(): Plugin {
  return {
    name: 'cors-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', (req, res) => {
        const reqUrl = new URL(req.url!, `http://${req.headers.host}`)
        const targetUrl = reqUrl.searchParams.get('url')
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing ?url= parameter' }))
          return
        }

        if (isBlockedUrl(targetUrl)) {
          res.writeHead(403, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'URL not allowed' }))
          return
        }

        fetch(targetUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
          },
          redirect: 'follow',
        })
          .then(async (response) => {
            const html = await response.text()
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
            })
            res.end(html)
          })
          .catch((err) => {
            res.writeHead(502, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `Failed to fetch URL: ${err.message}` }))
          })
      })
    },
  }
}

export default defineConfig({
  plugins: [
    imageExtractPlugin(),
    recipeChatPlugin(),
    recipeImageSearchPlugin(),
    recipeDiscoverPlugin(),
    corsProxyPlugin(),
    browserProxyPlugin(),
    instacartPlugin(),
    stripePlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mise',
        short_name: 'Mise',
        description: 'Just the recipe. No stories, no ads, no pop-ups.',
        display: 'standalone',
        theme_color: '#2d5016',
        background_color: '#fafaf5',
        share_target: {
          action: '/',
          method: 'GET',
          params: {
            url: 'url',
            title: 'title',
            text: 'text',
          },
        } as any,
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icon-192.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ sameOrigin, url }) => sameOrigin && /\.(jpg|jpeg|png|webp|gif)$/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'recipe-images',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, 'src/domain'),
      '@application': path.resolve(__dirname, 'src/application'),
      '@infrastructure': path.resolve(__dirname, 'src/infrastructure'),
      '@presentation': path.resolve(__dirname, 'src/presentation'),
    },
  },
})
