import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const rootDir = dirname(fileURLToPath(import.meta.url))

/**
 * Self-host the WASM EP pair the demo uses (non-jsep .mjs glue + .wasm) and
 * strip the unused jsep / asyncify / jspi variants Vite would otherwise emit.
 *
 * ORT dynamically `import()`s the .mjs next to wasmPaths — shipping only the
 * .wasm yields Safari's "Importing a module script failed" / "no available backend".
 *
 * Vite still embeds hashed `assets/ort-wasm-simd-threaded-*.wasm` URL strings in
 * the ORT/worker chunks; we delete those files (runtime uses wasmPaths → ort/).
 * Rewrite the dead strings to the self-hosted path so live GH Pages does not
 * expose 404 bait for the unused asset URLs.
 */
function ortWasmPlugin(): Plugin {
  const wasmName = 'ort-wasm-simd-threaded.wasm'
  const mjsName = 'ort-wasm-simd-threaded.mjs'
  /** Relative to dist/assets/*.js → dist/ort/… */
  const selfHostedRel = `../ort/${wasmName}`
  const deadAssetWasm = /(?:\.\/)?assets\/ort-wasm-simd-threaded-[A-Za-z0-9_-]+\.wasm/g
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
      const ortNpm = join(rootDir, 'node_modules/onnxruntime-web/dist')
      for (const name of [wasmName, mjsName]) {
        const src = join(ortNpm, name)
        if (!existsSync(src)) {
          this.warn(`ort-wasm: missing ${src}`)
          continue
        }
        copyFileSync(src, join(ortDir, name))
      }
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
          } else if (asset.endsWith('.js')) {
            const path = join(assets, asset)
            const src = readFileSync(path, 'utf8')
            const next = src.replace(deadAssetWasm, selfHostedRel)
            if (next !== src) writeFileSync(path, next)
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
      // autoUpdate so users stuck on the broken #16 SW pick up the ORT .mjs fix
      // without needing to click "Reload" on the update banner.
      registerType: 'autoUpdate',
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
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // App shell + samples/quiz assets. ORT wasm stays CacheFirst at runtime
        // (too large for the default 2 MB precache limit). Precache the small .mjs.
        globPatterns: [
          '**/*.{js,css,html,svg,json,woff2}',
          'samples/**/*',
          'favicon.svg',
          'ort/*.mjs',
        ],
        navigateFallback: 'index.html',
        // Never serve the SPA shell for ORT modules / wasm / model binaries.
        navigateFallbackDenylist: [
          /^\/api/,
          /\/ort\//,
          /\.mjs$/i,
          /\.wasm$/i,
          /\.onnx$/i,
        ],
        globIgnores: [
          '**/models/**',
          '**/ort/**/*.wasm',
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
            urlPattern: /\/ort\/.*\.(wasm|mjs)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ort-wasm-v2',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
          // `import('onnxruntime-web/wasm')` already emits a separate ORT chunk.
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
