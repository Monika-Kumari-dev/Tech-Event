import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Namma Honda Habba Event Pass',
        short_name: 'TFX Pass',
        description: 'Register, get your QR pass, and verify entry — even offline.',
        theme_color: '#4f46e5',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Admin-only bulk Excel/PDF/ZIP libraries are loaded on demand (online), not precached on every phone.
        globIgnores: ['**/assets/{xlsx,jspdf,jszip,html2canvas,purify,index.es}*.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    host: true,
    proxy: { '/api': 'http://localhost:4000' },
  },
})
