// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Force pdf.worker.mjs to the correct location for pdfjs-dist 4.x
      'pdfjs-dist/build/pdf.worker.mjs': path.resolve(
        __dirname,
        'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
      )
    }
  },
  build: {
    rollupOptions: {
      // Ensure react is bundled (not externalized)
      external: [],
    }
  }
});
