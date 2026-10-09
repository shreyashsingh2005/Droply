import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The plugin injects its own registration script. The app used to ALSO
      // register '/sw.js' by hand from main.tsx, which produced two
      // registrations and left stale precached HTML pointing at asset hashes
      // that no longer existed after a deploy -- the dynamic import for a lazy
      // route then rejected and the page went blank. There is now exactly one
      // registration, and `cleanupOutdatedCaches` discards superseded assets.
      registerType: 'autoUpdate',
      injectRegister: 'auto',

      // Only list files that actually exist in /public. The previous config
      // asked for favicon.ico, apple-touch-icon.png and masked-icon.svg, none
      // of which were in the repo, so the build emitted a manifest referencing
      // 404s.
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],

      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // SPA fallback for navigations, but never for the signalling
        // endpoints: a cached index.html must not be served in place of
        // /room/* or /ice-servers.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/room\//, /^\/ice-servers/, /^\/health/],
      },

      manifest: {
        id: '/',
        name: 'Droply — Private, Direct File Sharing',
        short_name: 'Droply',
        description:
          'Send files straight from one device to another in your browser. No account, no upload, no cloud storage.',
        theme_color: '#070D18',
        background_color: '#070D18',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        categories: ['utilities', 'productivity'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Send files', url: '/', description: 'Pick files and open a transfer room' },
          { name: 'Receive files', url: '/receive', description: 'Enter a room code to receive' },
        ],
      },
    }),
  ],

  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Keep the heavy, rarely-changing dependencies in their own chunks so
        // a code change does not invalidate them, and so the QR renderer is
        // not in the critical path for every route.
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'react';
          }
          if (id.includes('node_modules/qrcode.react')) {
            return 'qrcode';
          }
        },
      },
    },
  },

  server: {
    // Reachable from a phone on the same network for real two-device testing.
    host: true,
    proxy: {
      // Same-origin signalling in development, which is what
      // resolveSignalingUrl() targets when VITE_SIGNALING_URL is unset.
      '/room': { target: 'http://127.0.0.1:8787', ws: true, changeOrigin: true },
      '/ice-servers': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },

  preview: {
    host: true,
  },
});
