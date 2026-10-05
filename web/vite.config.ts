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
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const norm = id.replace(/\\/g, '/')
          if (norm.includes('/node_modules/three/') || /\/node_modules\/\.pnpm\/three@/.test(norm)) {
            return 'three'
          }
          if (norm.includes('/node_modules/@react-three/fiber')) return 'r3f'
          if (norm.includes('/node_modules/@react-three/drei')) return 'drei'
          if (
            norm.includes('/node_modules/@react-three/postprocessing') ||
            norm.includes('/node_modules/postprocessing')
          ) {
            return 'postfx'
          }
          if (norm.includes('/node_modules/gsap')) return 'gsap'
          if (norm.includes('/node_modules/three-stdlib')) return 'three-stdlib'
        },
      },
    },
  },
})
