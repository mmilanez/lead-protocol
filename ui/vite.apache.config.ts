import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react(), tailwindcss()],
  build: { outDir: '..', emptyOutDir: false, assetsDir: 'assets' },
})
