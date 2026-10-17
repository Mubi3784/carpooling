import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  let apiOrigin = null
  try {
    if (env.VITE_API_URL) apiOrigin = new URL(env.VITE_API_URL).origin
  } catch {
    apiOrigin = null
  }

  // Live data only: API requests always go to the network, never cached.
  const runtimeCaching = [
    {
      urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
      handler: 'NetworkOnly',
    },
  ]
  if (apiOrigin) {
    // RegExp (not a closure) because Workbox serializes urlPattern into sw.js.
    const escaped = apiOrigin.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    runtimeCaching.push({
      urlPattern: new RegExp(`^${escaped}/`),
      handler: 'NetworkOnly',
    })
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: false,
        manifest: {
          name: 'Carpooling',
          short_name: 'Carpool',
          description: 'Share rides and check road status for your daily commute.',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#059669',
          background_color: '#F8FAFC',
          icons: [
            { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png', purpose: 'any' },
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          importScripts: ['push-handler.js'],
          runtimeCaching,
        },
        devOptions: { enabled: false },
      }),
    ],
  }
})
