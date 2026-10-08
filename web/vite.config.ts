import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const rootDir = dirname(fileURLToPath(import.meta.url))

/**
 * Ship only the WASM EP binary the demo uses, and strip the unused ~28 MB
 * jsep / asyncify / jspi variants Vite would otherwise emit into dist/.
 */
function ortWasmPlugin(): Plugin {
  const wasmName = 'ort-wasm-simd-threaded.wasm'
  return {
    name: 'ort-wasm-single-variant',
    apply: 'build',
    generateBundle(_opts, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (fileName.endsWith('.wasm')) {
          delete bundle[fileName]
        }
      }
    },
    closeBundle() {
      const dist = join(rootDir, 'dist')
      const ortDir = join(dist, 'ort')
      mkdirSync(ortDir, { recursive: true })
      const src = join(rootDir, 'node_modules/onnxruntime-web/dist', wasmName)
      if (!existsSync(src)) {
        this.warn(`ort-wasm: missing ${src}`)
        return
      }
      copyFileSync(src, join(ortDir, wasmName))
      // Belt-and-suspenders: remove any stray wasm that landed outside ort/
      for (const name of readdirSync(dist)) {
        if (name.endsWith('.wasm')) {
          try {
            unlinkSync(join(dist, name))
          } catch {
            /* ignore */
          }
        }
      }
      const assets = join(dist, 'assets')
      if (existsSync(assets)) {
        for (const asset of readdirSync(assets)) {
          if (asset.endsWith('.wasm')) {
            try {
              unlinkSync(join(assets, asset))
            } catch {
              /* ignore */
            }
          }
        }
      }
    },
  }
}

// GitHub Pages project site needs the repo name as base.
// Locally and on preview, use '/'. CI sets VITE_BASE.
export default defineConfig({
  plugins: [
    react(),
    ortWasmPlugin(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'og-image.png'],
      manifest: {
        name: 'Lymph Node Metastasis Detector',
        short_name: 'PCam Detector',
        description:
          'Educational PatchCamelyon research demo. Not for clinical use.',
        theme_color: '#9B5654',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // App shell + samples/quiz assets. ORT wasm is CacheFirst at runtime
        // (too large for the default 2 MB precache limit). ONNX stays in Cache API.
        globPatterns: ['**/*.{js,css,html,svg,json,woff2}', 'samples/**/*', 'favicon.svg'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        globIgnores: [
          '**/models/**',
          '**/ort/**',
          '**/*.wasm',
          '**/og-*.png',
          '**/results/**',
        ],
        runtimeCaching: [
          {
            urlPattern: /\/models\/.*\.onnx$/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /\/ort\/.*\.wasm$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ort-wasm',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /\/(samples|results|quiz)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'demo-assets',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
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
          // Do NOT force onnxruntime-web into a manual chunk: Rolldown co-locates the
          // shared module-preload helper with that chunk, and Home/About/Results would
          // sync-import the entire ~400 KB ORT bundle just for the helper. Lazy
          // `import('onnxruntime-web')` already emits a separate ORT chunk.
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
