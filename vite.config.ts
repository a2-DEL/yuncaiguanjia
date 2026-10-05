import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        'finance-api-sw': fileURLToPath(new URL('./src/sw/finance-api-sw.ts', import.meta.url)),
      },
      output: {
        // 保持 Service Worker 入口文件名稳定，便于 navigator.serviceWorker.register 固定路径
        entryFileNames: (chunk) =>
          chunk.name === 'finance-api-sw' ? 'finance-api-sw.js' : 'assets/[name]-[hash].js',
      },
    },
  },
})
