import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'

const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:4182'
const OUT = process.env.SHOT_OUT || '/opt/cursor/artifacts/screenshots'
mkdirSync(OUT, { recursive: true })

async function waitCanvas(page) {
  await page.waitForSelector('.explainer-canvas-host canvas', { timeout: 60000 })
  await page.waitForTimeout(5000)
}

async function gotoExplainer(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForSelector('.explainer-stage-shell', { timeout: 60000 })
  await page.locator('#explainer-stages').scrollIntoViewIfNeeded()
  await waitCanvas(page)
}

async function clickStep(page, index) {
  await page.locator('.step-tab').nth(index).click()
  await page.waitForTimeout(3800)
}

async function shotViewport(page, name) {
  await page.locator('.explainer-viewport').screenshot({ path: join(OUT, name), type: 'png' })
  console.log('saved', name)
}

async function cropShoulder(page, name) {
  const vp = page.locator('.explainer-viewport')
  const box = await vp.boundingBox()
  if (!box) return
  // pec/clavicle: upper-left of torso relative to viewport
  const clip = {
    x: box.x + box.width * 0.22,
    y: box.y + box.height * 0.12,
    width: box.width * 0.32,
    height: box.height * 0.36,
  }
  await page.screenshot({ path: join(OUT, name), type: 'png', clip })
  console.log('saved crop', name)
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
})
const page = await context.newPage()
await gotoExplainer(page)
for (const [idx, label] of [
  [0, 'step1'],
  [1, 'step2'],
]) {
  await clickStep(page, idx)
  await shotViewport(page, `smudge_${label}_v8.png`)
  await cropShoulder(page, `smudge_${label}_v8_crop.png`)
}
await browser.close()
console.log('done')
