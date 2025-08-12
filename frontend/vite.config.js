import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      external: [] // No need for pdfjs-dist here — it's from CDN
    }
  }
});
