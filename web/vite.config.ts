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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/@react-three/fiber')) return 'r3f'
          if (id.includes('node_modules/@react-three/drei')) return 'drei'
          if (id.includes('node_modules/@react-three/postprocessing') || id.includes('node_modules/postprocessing')) {
            return 'postfx'
          }
          if (id.includes('node_modules/gsap')) return 'gsap'
          if (id.includes('node_modules/three-stdlib')) return 'three-stdlib'
        },
      },
    },
  },
})
