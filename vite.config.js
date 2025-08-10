// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'pdfjs-dist/build/pdf.worker.mjs': path.resolve(
        __dirname,
        'node_modules/pdfjs-dist/build/pdf.worker.mjs'
      )
    }
  }
});
