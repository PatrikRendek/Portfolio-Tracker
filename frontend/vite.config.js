import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      usePolling: true,
    },
    hmr: {
      host: 'localhost',
      clientPort: 5173,
    },
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        xfwd: true,
      },
      '/accounts': {
        target: apiTarget,
        changeOrigin: true,
        xfwd: true,
      },
    },
  },
})
