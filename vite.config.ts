import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'node:path';

// stellar-shade and @stellar/stellar-sdk both reference `Buffer` and `global`
// unguarded, and neither ships a `browser` field. Without these polyfills the
// app dies at the first send/scan call, in dev *and* in the production bundle.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util', 'events', 'process'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  optimizeDeps: {
    include: ['stellar-shade', '@stellar/stellar-sdk'],
  },
});
