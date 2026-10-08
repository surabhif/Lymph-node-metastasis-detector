#!/usr/bin/env node
/**
 * Smoke-test ORT wasm + model load against a production build served under the
 * GitHub Pages project base path. Fails if the .mjs glue is missing/mis-served
 * (Safari: "Importing a module script failed" / "no available backend").
 *
 * Usage (from web/): node scripts/smoke-ort-model.mjs
 * Expects dist/ already built with VITE_BASE=/Lymph-node-metastasis-detector/
 * Env: SMOKE_BASE (default /Lymph-node-metastasis-detector/), SMOKE_PORT, SMOKE_BROWSER=chromium|webkit|both
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { chromium, webkit } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const BASE = (process.env.SMOKE_BASE || '/Lymph-node-metastasis-detector/').replace(/\/?$/, '/')
const PORT = Number(process.env.SMOKE_PORT || 4191)
const browsers = (process.env.SMOKE_BROWSER || 'both').toLowerCase()

if (!existsSync(join(dist, 'index.html'))) {
  console.error('smoke-ort: missing dist/index.html — build with VITE_BASE first')
  process.exit(1)
}
for (const name of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
  const p = join(dist, 'ort', name)
  if (!existsSync(p)) {
    console.error(`smoke-ort: missing ${p}`)
    process.exit(1)
  }
}

const stageRoot = join(root, '.smoke-ghpages')
const staged = join(stageRoot, BASE.replace(/^\/|\/$/g, ''))
rmSync(stageRoot, { recursive: true, force: true })
mkdirSync(staged, { recursive: true })
cpSync(dist, staged, { recursive: true })

/** Minimal static server with correct MIME for .mjs / .wasm under the base path. */
function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.mjs')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.wasm')) return 'application/wasm'
  if (filePath.endsWith('.json')) return 'application/json'
  if (filePath.endsWith('.onnx')) return 'application/octet-stream'
  if (filePath.endsWith('.png')) return 'image/png'
  if (filePath.endsWith('.svg')) return 'image/svg+xml'
  if (filePath.endsWith('.webmanifest')) return 'application/manifest+json'
  return 'application/octet-stream'
}

const server = createServer(async (req, res) => {
  const { readFile } = await import('node:fs/promises')
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  if (urlPath.endsWith('/')) urlPath += 'index.html'
  const filePath = join(stageRoot, urlPath)
  if (!filePath.startsWith(stageRoot)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  try {
    const buf = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' })
    res.end(buf)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('not found')
  }
})

await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${PORT}${BASE}`
console.log(`smoke-ort: serving ${origin}`)

async function assertOrtAssets(page) {
  const mjs = await page.request.get(`${origin}ort/ort-wasm-simd-threaded.mjs`)
  const wasm = await page.request.get(`${origin}ort/ort-wasm-simd-threaded.wasm`)
  if (mjs.status() !== 200) throw new Error(`ort .mjs HTTP ${mjs.status()}`)
  if (wasm.status() !== 200) throw new Error(`ort .wasm HTTP ${wasm.status()}`)
  const mjsCt = mjs.headers()['content-type'] || ''
  if (!/javascript|ecmascript/i.test(mjsCt)) {
    throw new Error(`ort .mjs wrong Content-Type: ${mjsCt}`)
  }
  const bodyStart = (await mjs.text()).slice(0, 40)
  if (bodyStart.includes('<!DOCTYPE') || bodyStart.includes('<html')) {
    throw new Error('ort .mjs served HTML (SPA fallback bug)')
  }
}

async function runBrowser(browserType, label) {
  const browser = await browserType.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await assertOrtAssets(page)

  await page.goto(`${origin}demo/`, { waitUntil: 'networkidle', timeout: 120_000 })
  // Click first gallery sample to trigger model download + inference
  const sample = page.locator('.gallery-item').first()
  await sample.waitFor({ timeout: 30_000 })
  await sample.click()

  // Wait for a probability readout (Demo shows P=… or similar)
  const result = page.locator('.result-card, .demo-result, .verdict-pill, .metric-card').first()
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText || ''
      if (/no available backend|Importing a module script failed|Model download failed/i.test(text)) {
        return 'ERR:' + text.slice(0, 200)
      }
      if (/P\s*=\s*0\.\d+|probability|Likely|Uncertain|tumor|normal/i.test(text) &&
          !/Model not loaded yet/i.test(text)) {
        // Prefer seeing a numeric probability
        if (/\d+\.\d+%|\b0\.\d{2,}\b|P\s*=/.test(text)) return 'OK'
      }
      return null
    },
    null,
    { timeout: 180_000 },
  ).catch(async (e) => {
    const body = await page.locator('body').innerText()
    throw new Error(`${label} inference wait failed: ${e.message}\nBODY:\n${body.slice(0, 800)}`)
  })

  const flag = await page.evaluate(() => {
    const text = document.body?.innerText || ''
    if (/no available backend|Importing a module script failed/i.test(text)) return 'ERR'
    return /\d+\.\d+%|\b0\.\d{2,}\b|P\s*=/.test(text) ? 'OK' : 'AMBIG'
  })
  if (flag !== 'OK') {
    const body = await page.locator('body').innerText()
    throw new Error(`${label} no probability shown (${flag}). BODY:\n${body.slice(0, 800)}`)
  }
  if (pageErrors.some((e) => /no available backend|Importing a module script failed/i.test(e))) {
    throw new Error(`${label} pageerror: ${pageErrors.join(' | ')}`)
  }

  // Second load with SW (if registered) — navigate away and back
  await page.goto(`${origin}`, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.goto(`${origin}demo/`, { waitUntil: 'networkidle', timeout: 60_000 })
  await assertOrtAssets(page)
  await page.locator('.gallery-item').nth(1).click()
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText || ''
      if (/no available backend|Importing a module script failed/i.test(text)) return false
      return /\d+\.\d+%|\b0\.\d{2,}\b|P\s*=/.test(text)
    },
    null,
    { timeout: 180_000 },
  )

  const shot = join(root, '..', 'artifacts', `smoke-ort-${label}.png`)
  try {
    mkdirSync(dirname(shot), { recursive: true })
    await page.screenshot({ path: shot, fullPage: false })
    console.log(`smoke-ort: wrote ${shot}`)
  } catch {
    /* optional */
  }

  await browser.close()
  console.log(`smoke-ort: ${label} OK`)
}

const jobs = []
if (browsers === 'both' || browsers === 'chromium') jobs.push(runBrowser(chromium, 'chromium'))
if (browsers === 'both' || browsers === 'webkit') jobs.push(runBrowser(webkit, 'webkit'))

try {
  for (const job of jobs) await job
  console.log('smoke-ort: all browsers passed')
  writeFileSync(join(dist, 'smoke-ort-ok.json'), JSON.stringify({ ok: true, base: BASE }, null, 2))
} catch (e) {
  console.error(e)
  process.exitCode = 1
} finally {
  server.close()
  rmSync(stageRoot, { recursive: true, force: true })
}
