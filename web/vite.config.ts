import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages project site needs the repo name as base.
// Locally and on preview, use '/'. CI sets VITE_BASE.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE || '/',
  assetsInclude: ['**/*.onnx'],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
})
