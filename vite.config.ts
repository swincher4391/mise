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
            const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'Qwen/Qwen2.5-VL-7B-Instruct',
                provider: 'hyperbolic',
                messages: [
                  {
                    role: 'user',
                    content: [
                      { type: 'text', text: prompt },
                      { type: 'image_url', image_url: { url: parsed.image } },
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

        fetch(targetUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
    corsProxyPlugin(),
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
        icons: [
          { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: '/icon-192.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.(jpg|jpeg|png|webp|gif)$/i,
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
