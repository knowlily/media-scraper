import { defineConfig } from 'vite';
import { resolve } from 'path';

// Vite config for Chrome Extension (Manifest V3)
// Multiple entry points: popup, panel, content script, service worker
// Outputs to dist/ with ES module format for Chrome 110+
export default defineConfig({
  build: {
    target: 'chrome110',
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.ts'),
        panel: resolve(__dirname, 'src/panel/panel.ts'),
        content: resolve(__dirname, 'src/content/content.ts'),
        background: resolve(__dirname, 'src/background/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
        // Chrome MV3 requires ES modules
        format: 'es',
      },
    },
  },
});
