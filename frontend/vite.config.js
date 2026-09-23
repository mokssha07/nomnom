import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to the Django backend so the browser only ever
// talks to localhost:5173 and there is no CORS setup to do. Flip api/index.js
// to the real client and this becomes live.
export default defineConfig({
  plugins: [react()],
  server: {
    // Playwright drops locked .crx files in here; vite's watcher dies on them.
    watch: { ignored: ['**/.playwright-mcp/**'] },
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
