#!/usr/bin/env node
/**
 * GitHub Pages SPA deep-link fallback.
 *
 * Project Pages only serves files that exist. Client-side React Router routes
 * 404 on refresh or shared links unless we either:
 *   1) copy index.html → 404.html (GH Pages custom 404 still returns HTTP 404), or
 *   2) place index.html under each route directory (HTTP 200).
 *
 * We do both: directory indexes for known routes (200), plus 404.html for any
 * other client path. At the same step we rewrite per-route <title>, description,
 * og:url, og:image, and canonical so crawlers (no JS) get route-specific cards.
 * Must run *after* `vite build` so hashed asset URLs are kept.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

const SITE = 'https://surabhif.github.io/Lymph-node-metastasis-detector'
const NOT_CLINICAL = 'Research demo, not for clinical use.'

/** @type {{ path: string, title: string, description: string, ogImage: string }[]} */
const routes = [
  {
    path: 'results',
    title: 'Results · PCam Metastasis Detector',
    description: `Baseline metrics, ROC, calibration, and confident mistakes on PatchCamelyon. ${NOT_CLINICAL}`,
    ogImage: `${SITE}/og-image.png`,
  },
  {
    path: 'about',
    title: 'About · PCam Metastasis Detector',
    description: `About this educational PatchCamelyon research demo and how to cite it. ${NOT_CLINICAL}`,
    ogImage: `${SITE}/og-image.png`,
  },
  {
    path: 'demo',
    title: 'Try the detector · PCam Metastasis Detector',
    description: `In-browser PatchCamelyon detector with class-activation heatmaps. ${NOT_CLINICAL}`,
    ogImage: `${SITE}/og-image.png`,
  },
  {
    path: 'model-card',
    title: 'Model card · PCam Metastasis Detector',
    description: `Model card for the educational PCam ResNet-18 baseline. ${NOT_CLINICAL}`,
    ogImage: `${SITE}/og-image.png`,
  },
]

copyFileSync(indexHtml, join(dist, '404.html'))
console.log('Wrote dist/404.html')

/**
 * @param {string} html
 * @param {{ path: string, title: string, description: string, ogImage: string }} meta
 */
function rewriteMeta(html, meta) {
  const url = `${SITE}/${meta.path}/`
  let out = html
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`)
  out = out.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${meta.description}" />`,
  )
  out = out.replace(
    /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:title" content="${meta.title}" />`,
  )
  out = out.replace(
    /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${meta.description}" />`,
  )
  out = out.replace(
    /<meta\s+property="og:image"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:image" content="${meta.ogImage}" />`,
  )
  out = out.replace(
    /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/,
    `<meta property="og:url" content="${url}" />`,
  )
  out = out.replace(
    /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:title" content="${meta.title}" />`,
  )
  out = out.replace(
    /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${meta.description}" />`,
  )
  out = out.replace(
    /<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/>/,
    `<meta name="twitter:image" content="${meta.ogImage}" />`,
  )
  if (!out.includes('rel="canonical"')) {
    out = out.replace(
      '</head>',
      `    <link rel="canonical" href="${url}" />\n  </head>`,
    )
  } else {
    out = out.replace(
      /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
      `<link rel="canonical" href="${url}" />`,
    )
  }
  return out
}

for (const route of routes) {
  const dir = join(dist, route.path)
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, 'index.html')
  writeFileSync(dest, rewriteMeta(shell, route))
  console.log(`Wrote dist/${route.path}/index.html (route OG)`)
}

console.log('SPA deep-link fallbacks ready for GitHub Pages')
