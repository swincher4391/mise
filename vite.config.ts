import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  server: {
    proxy: {
      '/api/proxy': {
        target: 'https://placeholder.invalid',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (_proxyReq, req, res) => {
            const url = new URL(req.url!, `http://${req.headers.host}`)
            const targetUrl = url.searchParams.get('url')
            if (!targetUrl) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Missing ?url= parameter' }))
              return
            }
            // Cancel the default proxy and do our own fetch
            _proxyReq.destroy()

            fetch(targetUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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
              .catch(() => {
                res.writeHead(502, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Failed to fetch URL' }))
              })
          })
        },
      },
    },
  },
  plugins: [
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
