import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      },
      '/prometheus': {
        target: 'http://localhost:9090',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/prometheus/, '')
      },
      '/jaeger': {
        target: 'http://localhost:16686',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/jaeger/, '')
      }
    }
  }
})
