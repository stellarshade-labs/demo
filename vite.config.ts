import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';

// stellar-shade and @stellar/stellar-sdk both reference `Buffer` and `global`
// unguarded, and neither ships a `browser` field. Without these polyfills the
// app dies at the first send/scan call, in dev *and* in the production bundle.
export default defineConfig({
  plugins: [
    // Opt-in self-signed HTTPS for testing on a phone over the LAN: Web Crypto
    // (crypto.subtle — vault encryption, key derivation) is only exposed in a
    // secure context, so a plain http:// LAN IP can't create an identity.
    // Enable with: HTTPS=true npm run dev -- --host
    ...(process.env.HTTPS === 'true' ? [basicSsl()] : []),
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util', 'events', 'process'],
      globals: { Buffer: true, global: true, process: true },
    }),
    // Makes Shade installable (add-to-home-screen) and caches the shell so the
    // app opens offline. NOTE: a service worker cannot reliably run background
    // crypto scans once every tab is closed — no browser guarantees wake-ups for
    // that — so "background" here means: installed app + scan-on-open + browser
    // notifications while a tab is alive, not closed-tab polling.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['shade-icon.svg'],
      manifest: {
        name: 'Shade',
        short_name: 'Shade',
        description: 'Stealth, unlinkable payments on Stellar.',
        theme_color: '#0b0c0e',
        background_color: '#0b0c0e',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'shade-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  optimizeDeps: {
    include: ['stellar-shade', '@stellar/stellar-sdk'],
  },
});
