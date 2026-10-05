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

/** Smoothly animate window scroll so ScrollTrigger scrub eases through blends. */
async function wheelScrollToProgress(page, fromP, toP, durationMs) {
  await page.evaluate(
    async ({ fromP, toP, durationMs }) => {
      const track = document.querySelector('#explainer-stages')
      if (!track) return
      const rect = track.getBoundingClientRect()
      const top = window.scrollY + rect.top
      const height = Math.max(1, track.offsetHeight - window.innerHeight)
      const startY = top + height * fromP
      const endY = top + height * toP
      window.scrollTo(0, startY)
      const t0 = performance.now()
      await new Promise((resolve) => {
        const tick = (now) => {
          const t = Math.min(1, (now - t0) / durationMs)
          // Linear scrub so mid-blends stay on screen (ease-in-out was flashing them)
          window.scrollTo(0, startY + (endY - startY) * t)
          if (t < 1) requestAnimationFrame(tick)
          else {
            window.scrollTo(0, endY)
            resolve()
          }
        }
        requestAnimationFrame(tick)
      })
    },
    { fromP, toP, durationMs },
  )
  await page.waitForTimeout(600)
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

  // Warm meshes for continuous mid-blends, then return to step 1 before stills
  await holdProgress(page, 0.2, 1800)
  await holdProgress(page, 0.5, 2800)
  await holdProgress(page, 0.75, 2000)
  await holdProgress(page, 1, 2000)
  await holdProgress(page, 0, 2000)

  // Mid 2→3: dive with glowing orb (cutaway interior still sealed — no torso disc)
  await holdProgress(page, 0.38, 5000)
  console.log('mid23', await page.getAttribute('[data-progress]', 'data-progress'))
  await shotViewport(page, 'p2_desktop_mid_2_3.png')

  await holdProgress(page, 0.9, 5000)
  console.log('mid45', await page.getAttribute('[data-progress]', 'data-progress'))
  await shotViewport(page, 'p2_desktop_mid_4_5.png')

  // Settled steps via eased tab navigation (from a clean step-1 baseline)
  await page.locator('.step-tab').nth(0).click()
  await page.waitForTimeout(1600)
  for (let i = 0; i < 5; i++) {
    await page.locator('.step-tab').nth(i).click()
    await page.waitForTimeout(1600)
    await shotViewport(page, `p2_desktop_step${i + 1}.png`)
  }
  // Full page step 5 for CTA visibility
  await page.screenshot({ path: join(OUT, 'p2_desktop_step5_with_cta.png'), type: 'png' })
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
    await page.waitForTimeout(1600)
    // Force settle at snap so mobile step-5 mosaic is fully in
    await holdProgress(page, [0, 0.25, 0.5, 0.75, 1][i], 2000)
    await page.waitForTimeout(600)
    try {
      await shotViewport(page, `p2_phone_step${i + 1}.png`)
      if (i === 2) {
        await page.screenshot({ path: join(OUT, 'p2_phone_step3_full.png'), type: 'png' })
      }
    } catch (err) {
      console.warn('phone shot failed', i + 1, String(err))
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

  // Start at top of explainer; warm scenes then fully release the hold lock
  await holdProgress(page, 0, 1200)
  await holdProgress(page, 0.5, 1800)
  await holdProgress(page, 1, 1500)
  await holdProgress(page, 0, 1200)
  // Ensure overlapping hold locks are cleared before real scroll
  await page.evaluate(() => {
    window.__releaseExplainerScroll?.()
  })
  await page.waitForTimeout(400)

  // Segment durations: ~10–12s linear travel + ~3s pause at each snap (~50–55s scrub)
  const snaps = [0, 0.25, 0.5, 0.75, 1]
  for (let i = 0; i < snaps.length - 1; i++) {
    const a = snaps[i]
    const b = snaps[i + 1]
    console.log(`wheel ${a} → ${b}`)
    await wheelScrollToProgress(page, a, b, 11000)
    await page.waitForTimeout(3000) // pause at snap
  }
  await page.waitForTimeout(800)

  // —— Pill-click segment: same eased ~1s flight as scroll ——
  await page.evaluate(() => window.__releaseExplainerScroll?.())
  await page.locator('.step-tab').nth(0).click()
  await page.waitForTimeout(1400)
  console.log('pill click tour')
  for (let i = 1; i < 5; i++) {
    await page.locator('.step-tab').nth(i).click()
    await page.waitForTimeout(1600) // ~1s ease + settle
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
