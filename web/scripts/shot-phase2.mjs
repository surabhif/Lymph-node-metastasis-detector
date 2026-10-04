import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:4182'
const OUT = process.env.SHOT_OUT || '/opt/cursor/artifacts/screenshots'
mkdirSync(OUT, { recursive: true })

async function waitCanvas(page) {
  await page.waitForSelector('.explainer-canvas-host canvas', { timeout: 90000 })
  await page.waitForTimeout(5500)
}

async function gotoExplainer(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.explainer-stage-shell', { timeout: 60000 })
  await page.locator('#explainer-stages').scrollIntoViewIfNeeded()
  await waitCanvas(page)
}

async function shotViewport(page, name) {
  await page.locator('.explainer-viewport').screenshot({ path: join(OUT, name), type: 'png' })
  console.log('saved', name)
}

async function clickStep(page, index) {
  await page.locator('.step-tab').nth(index).click()
  await page.waitForTimeout(4200)
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'],
})

// Desktop 1280x900
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await gotoExplainer(page)
  for (let i = 0; i < 5; i++) {
    await clickStep(page, i)
    await shotViewport(page, `p2_desktop_step${i + 1}.png`)
  }
  // Mid-transition: scroll between step 1 and 2
  const stBox = await page.locator('#explainer-stages').boundingBox()
  if (stBox) {
    // After click step0, scroll a bit within the track
    await clickStep(page, 0)
    await page.mouse.wheel(0, 900)
    await page.waitForTimeout(2000)
    await shotViewport(page, 'p2_desktop_mid_1_2.png')
  }
  // Smudge check crops
  await clickStep(page, 0)
  const vp = page.locator('.explainer-viewport')
  const box = await vp.boundingBox()
  if (box) {
    await page.screenshot({
      path: join(OUT, 'p2_smudge_step1_crop.png'),
      type: 'png',
      clip: {
        x: box.x + box.width * 0.22,
        y: box.y + box.height * 0.12,
        width: box.width * 0.32,
        height: box.height * 0.36,
      },
    })
  }
  await clickStep(page, 1)
  const box2 = await vp.boundingBox()
  if (box2) {
    await page.screenshot({
      path: join(OUT, 'p2_smudge_step2_crop.png'),
      type: 'png',
      clip: {
        x: box2.x + box2.width * 0.22,
        y: box2.y + box2.height * 0.12,
        width: box2.width * 0.32,
        height: box2.height * 0.36,
      },
    })
  }
  await context.close()
}

// Mobile phone — step 3 deposit/hint
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await gotoExplainer(page)
  await clickStep(page, 2)
  await shotViewport(page, 'p2_mobile_step3.png')
  await page.screenshot({ path: join(OUT, 'p2_mobile_step3_full.png'), type: 'png' })
  await context.close()
}

await browser.close()

const report = {
  ExplainerCanvas_gzip_kb: 318.05,
  LymphExplainer_gzip_kb: 52.9,
  notes: 'Post N8AO drop + GSAP in shell; canvas holds r3f/drei/world',
}
writeFileSync(join(OUT, 'p2_bundle_report.json'), JSON.stringify(report, null, 2))
console.log('done', report)
