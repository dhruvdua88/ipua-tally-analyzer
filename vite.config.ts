import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// GitHub Pages serves the repo under /tally-analyzer/. Local dev uses '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/ipua-tally-analyzer/' : '/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
}))
