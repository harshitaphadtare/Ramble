import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Ramble',
        short_name: 'Ramble',
        description: 'Your personal explore map. Works with zero bars.',
        theme_color: '#1f3d2b',
        background_color: '#f6f4ee',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // AI runtimes (20–35 MB each) and the test page are cached on demand, not precached.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,webmanifest}'],
        globIgnores: ['wasm/**', 'spike.html', 'assets/spike-*', 'assets/transformers*', 'assets/*.wasm'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // The map engine is big and changes rarely: its own long-cached chunk, loaded alongside the shell.
        manualChunks(id: string) {
          if (id.includes('node_modules/maplibre-gl')) return 'maplibre';
          if (id.includes('node_modules/react')) return 'react';
        },
      },
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        spike: resolve(import.meta.dirname, 'spike.html'),
      },
    },
  },
  worker: { format: 'es' },
  server: {
    proxy: { '/api': 'http://localhost:8787' },
  },
});
