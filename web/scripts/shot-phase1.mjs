import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'

const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:4180'
const OUT = process.env.SHOT_OUT || '/opt/cursor/artifacts/screenshots'
mkdirSync(OUT, { recursive: true })

async function waitCanvas(page) {
  await page.waitForSelector('.explainer-canvas-host canvas', { timeout: 60000 })
  await page.waitForTimeout(4500)
}

async function gotoExplainer(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForSelector('.explainer-stage-shell', { timeout: 60000 })
  await page.locator('#explainer-stages').scrollIntoViewIfNeeded()
  await waitCanvas(page)
}

async function clickStep(page, index) {
  await page.locator('.step-tab').nth(index).click()
  await page.waitForTimeout(3500)
}

async function shotViewport(page, name) {
  await page.locator('.explainer-viewport').screenshot({ path: join(OUT, name), type: 'png' })
  console.log('saved', name)
}

/** Drag canvas horizontally to approximate a more frontal view. */
async function dragToFront(page) {
  const canvas = page.locator('.explainer-canvas-host canvas')
  const box = await canvas.boundingBox()
  if (!box) return
  const x = box.x + box.width * 0.55
  const y = box.y + box.height * 0.45
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + box.width * 0.22, y, { steps: 18 })
  await page.mouse.up()
  await page.waitForTimeout(900)
}

async function runDesktop(browser) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await gotoExplainer(page)
  for (let i = 0; i < 4; i++) {
    await clickStep(page, i)
    await shotViewport(page, `v11_desktop_step${i + 1}.png`)
    if (i === 0 || i === 1) {
      await dragToFront(page)
      await shotViewport(page, `v11_desktop_step${i + 1}_front.png`)
      await clickStep(page, i)
      await page.waitForTimeout(1200)
    }
  }
  await context.close()
}

async function runMobile(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await gotoExplainer(page)
  for (const [idx, label] of [
    [0, 1],
    [2, 3],
    [3, 4],
  ]) {
    await clickStep(page, idx)
    if (idx === 2) {
      const toggle = page.locator('.legend-toggle')
      if (await toggle.count()) {
        const expanded = await toggle.getAttribute('aria-expanded')
        if (expanded !== 'true') await toggle.click()
        await page.waitForTimeout(500)
      }
    }
    await shotViewport(page, `v11_mobile_step${label}.png`)
  }
  await context.close()
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
})
try {
  await runDesktop(browser)
  await runMobile(browser)
} finally {
  await browser.close()
}
console.log('done')
