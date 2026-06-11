import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// User site at https://himayetsu.github.io/ — repo name himayetsu.github.io, so base is root
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    // in dev, /v3 is served by the v3 dev server (started alongside by `npm run dev`)
    proxy: {
      '/v3': {
        target: 'http://localhost:5174',
        ws: true,
        // bare /v3 (no trailing slash) should hit the v3 index too
        rewrite: (path) => (path === '/v3' ? '/v3/' : path),
      },
    },
  },
})
