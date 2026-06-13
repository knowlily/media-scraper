import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync, cpSync } from 'fs';

// Vite config for Chrome Extension (Manifest V3)
// Multiple entry points: popup, content script, service worker
// Outputs to dist/ with ES module format for Chrome 110+
export default defineConfig({
  plugins: [
    {
      name: 'copy-extension-assets',
      writeBundle() {
        // Copy popup.html and fix script src from popup.ts → popup.js
        let html = readFileSync(resolve(__dirname, 'src/popup/popup.html'), 'utf-8');
        html = html.replace('src="popup.ts"', 'src="popup.js"');
        writeFileSync(resolve(__dirname, 'dist/popup.html'), html);

        // Copy popup.css
        cpSync(
          resolve(__dirname, 'src/popup/popup.css'),
          resolve(__dirname, 'dist/popup.css'),
        );

        // Copy manifest.json
        cpSync(
          resolve(__dirname, 'manifest.json'),
          resolve(__dirname, 'dist/manifest.json'),
        );

        // Copy icons
        cpSync(
          resolve(__dirname, 'icons'),
          resolve(__dirname, 'dist/icons'),
          { recursive: true },
        );
      },
    },
  ],
  build: {
    target: 'chrome110',
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.ts'),
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
