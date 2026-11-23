import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        // Named so injectManifest's globIgnores below can target it: Firebase
        // is dynamically imported (src/sync/firebase.ts) specifically so an
        // unconfigured build never fetches it, which a generic hashed chunk
        // name would not let the precache step tell apart from everything else.
        manualChunks(id: string) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase'
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: null, // src/pwa/pwa.ts registers it, so it can drive the update toast
      injectManifest: {
        // mock/ is deliberately absent: audio must never be precached, and the
        // catalog/artwork are there to exercise the runtime caching routes.
        globPatterns: ['**/*.{js,css,html,woff2}', 'icons/*.png'],
        globIgnores: [
          // The 512s exist only for the install prompt and the Android launcher,
          // which are read once, online. Precaching them would put ~230 KB of
          // artwork the app never renders in front of the first offline launch.
          '**/icon-512.png',
          '**/maskable-512.png',
          // ~190 KB gzipped, loaded on demand (src/sync/firebase.ts) only once
          // signed in — precaching it would cost every install that bandwidth
          // whether or not cloud backup is even configured for this build.
          '**/firebase-*.js',
        ],
      },
      manifest: {
        id: '/',
        name: 'Musu Player',
        short_name: 'Musu Player',
        description: 'Download music once, play it with no network.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#121212',
        background_color: '#121212',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      devOptions: { enabled: true, type: 'module', navigateFallback: 'index.html' },
    }),
  ],
  preview: {
    // `cloudflared tunnel --url http://localhost:4173` hands out a *.trycloudflare.com host
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app', '.loca.lt'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'functions/**/*.test.ts'],
  },
})
