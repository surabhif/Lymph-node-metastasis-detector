#!/usr/bin/env node
/**
 * GitHub Pages SPA deep-link fallback.
 *
 * Project Pages only serves files that exist. Client-side React Router routes
 * (/results, /about, /demo, /model-card) 404 on refresh or shared links unless
 * we either:
 *   1) copy index.html → 404.html (GH Pages custom 404 still returns HTTP 404), or
 *   2) place index.html under each route directory (HTTP 200).
 *
 * We do both: directory indexes for known routes (200), plus 404.html for any
 * other client path. Must run *after* `vite build` so hashed asset URLs are kept.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const indexHtml = join(dist, 'index.html')

if (!existsSync(indexHtml)) {
  console.error('spa-gh-pages-fallback: missing dist/index.html — run vite build first')
  process.exit(1)
}

const shell = readFileSync(indexHtml, 'utf8')
if (!shell.includes('id="root"')) {
  console.error('spa-gh-pages-fallback: dist/index.html does not look like the SPA shell')
  process.exit(1)
}

copyFileSync(indexHtml, join(dist, '404.html'))
console.log('Wrote dist/404.html')

const routes = ['results', 'about', 'demo', 'model-card']
for (const route of routes) {
  const dir = join(dist, route)
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, 'index.html')
  copyFileSync(indexHtml, dest)
  console.log(`Wrote dist/${route}/index.html`)
}

console.log('SPA deep-link fallbacks ready for GitHub Pages')
