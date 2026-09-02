import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The prediction API has no CORS middleware by design (see prediction-api/README.md
// "Scope"). Every browser request therefore has to be same-origin, so the dev server
// proxies both API prefixes through to the service.
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/health': { target: API_TARGET, changeOrigin: true },
    },
  },
})
