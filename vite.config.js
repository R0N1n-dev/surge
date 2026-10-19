import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

/**
 * Vite config tuned for a Capacitor WebView target, not a desktop browser:
 *
 *  - `base: './'` — the bundle is loaded from `file://` inside the WebView via
 *    the Capacitor scheme, so absolute `/asset.js` paths would 404.
 *  - Inline-critical CSS and no code-splitting gymnastics: the app shell must
 *    paint before any plugin resolves, otherwise the splash→app handoff flickers.
 *  - The design-token audit runs as part of `bun run verify`.
 */
export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'chrome90',
    cssCodeSplit: false,
    // The WebView is evergreen Chrome; ship modern syntax, skip legacy transpile.
    minify: 'esbuild',
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        // One JS + one CSS chunk keeps the first paint to two requests.
        inlineDynamicImports: true,
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
