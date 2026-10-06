import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// `npm run dev` proxies the API to a locally running mlw-app.
export default defineConfig({
  plugins: [vue()],
  // the Swagger UI chunk is large but only loaded when the API page is opened
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1600 },
  server: { proxy: { '/api': 'http://localhost:8080' } },
})
