import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  // host: true expone el dev server a la red local (otras compus/celulares en
  // el mismo WiFi pueden entrar por http://<IP-de-esta-compu>:5175).
  server: {
    host: true,
    port: 5175,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Separa el vendor estable (React y router) y las librerías pesadas
        // para reducir el chunk principal y mejorar el caché del navegador.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router') || id.includes('clsx') || id.includes('tailwind-merge')) return 'vendor'
          if (id.includes('lucide-react')) return 'icons'
          if (id.includes('qrcode') || id.includes('jsbarcode') || id.includes('html-to-image')) return 'print'
          return undefined
        },
      },
    },
  },
})
