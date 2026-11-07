import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist' },
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
