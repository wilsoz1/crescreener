import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // relative assets — works at crescreener.com root and at the github.io fallback URL
  server: { port: 5199, strictPort: true },
})
