import react from "@vitejs/plugin-react";

export default {
  plugins: [react()],
  build: {
    rollupOptions: {
      input: "./index.html"
    }
  }
};
