import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/VoxInbox/' : '/',
  build: {
    outDir: 'dist',
    sourcemap: false
  },
  server: {
    host: true,
    port: 5173
  }
})
