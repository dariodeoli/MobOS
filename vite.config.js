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
})
