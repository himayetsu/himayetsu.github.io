import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served alongside the main site at /v3/ (built into the parent's dist/v3)
export default defineConfig({
  plugins: [react()],
  base: '/v3/',
  build: {
    outDir: '../dist/v3',
    emptyOutDir: true,
  },
  server: {
    // fixed port so the main site's dev server can proxy /v3 here
    port: 5174,
    strictPort: true,
    // allow importing portfolio content from the parent project (src/data)
    fs: { allow: ['..'] },
  },
})
