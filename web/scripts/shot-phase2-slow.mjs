/**
 * Phase-2 QA capture: slow real wheel scroll through the explainer so
 * continuous blends are visible (not tab-snap jumps).
 *
 * Env: SHOT_BASE (default http://127.0.0.1:4210), SHOT_OUT (/opt/cursor/artifacts)
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:4210'
const OUT = process.env.SHOT_OUT || '/opt/cursor/artifacts'
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'screenshots'), { recursive: true })
mkdirSync(join(OUT, 'videos-raw'), { recursive: true })

async function gotoExplainer(page) {
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.explainer-stage-shell', { timeout: 60000 })
  await page.locator('#explainer-stages').scrollIntoViewIfNeeded()
  await page.waitForSelector('.explainer-canvas-host canvas', { timeout: 90000 })
  // Let poster fade / first frames settle
  await page.waitForTimeout(2800)
  await page.waitForSelector('canvas.explainer-canvas.is-ready', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(800)
}

async function shotViewport(page, name) {
  const path = join(OUT, 'screenshots', name)
  await page.locator('.explainer-viewport').screenshot({ path, type: 'png' })
  await page.locator('.explainer-viewport').screenshot({ path: join(OUT, name), type: 'png' })
  console.log('saved', name)
}

async function holdProgress(page, progress, holdMs = 4500) {
  await page.evaluate(
    ({ p, ms }) => {
      if (typeof window.__setExplainerProgress === 'function') {
        window.__setExplainerProgress(p, ms)
      }
    },
    { p: progress, ms: holdMs },
  )
  await page.evaluate((p) => {
    const track = document.querySelector('#explainer-stages')
    if (!track) return
    const rect = track.getBoundingClientRect()
    const top = window.scrollY + rect.top
    const height = track.offsetHeight - window.innerHeight
    window.scrollTo(0, top + Math.max(0, height) * p)
  }, progress)
  await page.waitForTimeout(Math.min(holdMs - 500, 3800))
}

/** Emit many small wheel ticks so ScrollTrigger scrub eases through blends. */
async function wheelScrollToProgress(page, fromP, toP, durationMs) {
  const steps = Math.max(24, Math.round(durationMs / 80))
  const track = page.locator('#explainer-stages')
  const box = await track.boundingBox()
  if (!box) return
  // Aim wheel at the sticky stage center
  const x = box.x + box.width * 0.4
  const y = Math.min(box.y + 120, box.y + box.height * 0.15)

  const startY = await page.evaluate((p) => {
    const track = document.querySelector('#explainer-stages')
    if (!track) return window.scrollY
    const rect = track.getBoundingClientRect()
    const top = window.scrollY + rect.top
    const height = track.offsetHeight - window.innerHeight
    return top + Math.max(0, height) * p
  }, fromP)
  const endY = await page.evaluate((p) => {
    const track = document.querySelector('#explainer-stages')
    if (!track) return window.scrollY
    const rect = track.getBoundingClientRect()
    const top = window.scrollY + rect.top
    const height = track.offsetHeight - window.innerHeight
    return top + Math.max(0, height) * p
  }, toP)

  // Seed start
  await page.evaluate((y) => window.scrollTo(0, y), startY)
  await page.waitForTimeout(200)

  const deltaTotal = endY - startY
  const perTick = deltaTotal / steps
  for (let i = 0; i < steps; i++) {
    await page.mouse.move(x, y)
    await page.mouse.wheel(0, perTick)
    await page.waitForTimeout(durationMs / steps)
  }
  // Settle exactly
  await page.evaluate((y) => window.scrollTo(0, y), endY)
  await page.waitForTimeout(400)
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'],
})

// —— Desktop stills + mid frames ——
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  await gotoExplainer(page)

  // Warm lazy scenes
  await holdProgress(page, 0.5, 3500)
  await holdProgress(page, 1, 2500)

  // Mid blends (held scrub — geometric midpoints)
  await holdProgress(page, 0.375, 5000)
  console.log('mid23', await page.getAttribute('[data-progress]', 'data-progress'))
  await shotViewport(page, 'p2_desktop_mid_2_3.png')

  await holdProgress(page, 0.875, 5000)
  console.log('mid45', await page.getAttribute('[data-progress]', 'data-progress'))
  await shotViewport(page, 'p2_desktop_mid_4_5.png')

  // Settled steps via eased tab navigation
  for (let i = 0; i < 5; i++) {
    await page.locator('.step-tab').nth(i).click()
    await page.waitForTimeout(1400) // allow ~1s ease + settle
    await shotViewport(page, `p2_desktop_step${i + 1}.png`)
  }
  await context.close()
}

// —— Phone stills 1 / 3 / 5 ——
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await gotoExplainer(page)
  for (const i of [0, 2, 4]) {
    await page.locator('.step-tab').nth(i).click()
    await page.waitForTimeout(1500)
    await shotViewport(page, `p2_phone_step${i + 1}.png`)
    if (i === 2) {
      await page.screenshot({ path: join(OUT, 'p2_phone_step3_full.png'), type: 'png' })
    }
  }
  await context.close()
}

// —— Slow wheel scroll-through recording (~45–55s) ——
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: join(OUT, 'videos-raw'), size: { width: 1280, height: 900 } },
  })
  const page = await context.newPage()
  await gotoExplainer(page)

  // Start at top of explainer
  await holdProgress(page, 0, 2000)
  await page.waitForTimeout(1500)

  // Segment durations: ~8–10s travel + ~3s pause at each snap
  const snaps = [0, 0.25, 0.5, 0.75, 1]
  for (let i = 0; i < snaps.length - 1; i++) {
    const a = snaps[i]
    const b = snaps[i + 1]
    console.log(`wheel ${a} → ${b}`)
    await wheelScrollToProgress(page, a, b, 9000)
    await page.waitForTimeout(3200) // pause at snap
  }
  await page.waitForTimeout(1200)

  const video = page.video()
  await context.close()
  if (video) {
    const vpath = await video.path()
    console.log('raw video', vpath)
    writeFileSync(join(OUT, 'p2_video_raw_path.txt'), vpath)
  }
}

await browser.close()
console.log('capture done')
