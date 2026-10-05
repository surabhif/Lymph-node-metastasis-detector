import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:4210'
const OUT = process.env.SHOT_OUT || '/opt/cursor/artifacts'
mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'screenshots'), { recursive: true })

async function gotoExplainer(page) {
  await page.goto(`${BASE}/?t=${Date.now()}`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.waitForSelector('.explainer-stage-shell', { timeout: 60000 })
  await page.locator('#explainer-stages').scrollIntoViewIfNeeded()
  await page.waitForSelector('.explainer-canvas-host canvas', { timeout: 90000 })
  await page.waitForTimeout(5000)
}

async function clickStep(page, index) {
  await page.locator('.step-tab').nth(index).click()
  await page.waitForTimeout(4200)
}

async function shotViewport(page, name) {
  const path = join(OUT, 'screenshots', name)
  await page.locator('.explainer-viewport').screenshot({ path, type: 'png' })
  // also copy to artifacts root for walkthrough
  await page.locator('.explainer-viewport').screenshot({ path: join(OUT, name), type: 'png' })
  console.log('saved', name)
}

async function measureFps(page, ms = 2500) {
  return page.evaluate(async (duration) => {
    return await new Promise((resolve) => {
      let frames = 0
      let start = 0
      const tick = (t) => {
        if (!start) start = t
        frames++
        if (t - start < duration) requestAnimationFrame(tick)
        else resolve(Math.round((frames * 1000) / (t - start)))
      }
      requestAnimationFrame(tick)
    })
  }, ms)
}

async function scrollToProgress(page, progress) {
  await page.evaluate((p) => {
    const track = document.querySelector('#explainer-stages')
    if (!track) return
    const rect = track.getBoundingClientRect()
    const top = window.scrollY + rect.top
    const height = track.offsetHeight - window.innerHeight
    window.scrollTo(0, top + Math.max(0, height) * p)
  }, progress)
  await page.waitForTimeout(2200)
}

/** Hold an exact mid-transition scrub (bypasses GSAP snap). */
async function holdProgress(page, progress, holdMs = 5000) {
  await page.evaluate(
    ({ p, ms }) => {
      if (typeof window.__setExplainerProgress === 'function') {
        window.__setExplainerProgress(p, ms)
      }
    },
    { p: progress, ms: holdMs },
  )
  // Also scroll the track so camera path / sticky stage stay aligned
  await page.evaluate((p) => {
    const track = document.querySelector('#explainer-stages')
    if (!track) return
    const rect = track.getBoundingClientRect()
    const top = window.scrollY + rect.top
    const height = track.offsetHeight - window.innerHeight
    window.scrollTo(0, top + Math.max(0, height) * p)
  }, progress)
  await page.waitForTimeout(Math.min(holdMs - 400, 4200))
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'],
})

const fpsReport = { desktop: {}, phone: {}, notes: [] }

// —— Desktop 1280 ——
{
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: join(OUT, 'videos-raw'), size: { width: 1280, height: 900 } },
  })
  const page = await context.newPage()
  await gotoExplainer(page)

  // Warm lazy step scenes so mid-frame holds are not racing code-split chunks
  await clickStep(page, 2)
  await clickStep(page, 4)
  await page.waitForTimeout(1500)

  // Mid-transition frames with held scrub (bypasses GSAP snap).
  // 0.42 is the first scrub where the cut-away is camera-framed mid-dive;
  // 0.375 is geometric halfway but still axilla-dominant with the CatmullRom path.
  await holdProgress(page, 0.42, 6000)
  const mid23Progress = await page.getAttribute('[data-progress]', 'data-progress')
  console.log('mid 2→3 data-progress', mid23Progress)
  await page.waitForTimeout(800)
  await shotViewport(page, 'p2_desktop_mid_2_3.png')

  await holdProgress(page, 0.875, 6000)
  const mid45Progress = await page.getAttribute('[data-progress]', 'data-progress')
  console.log('mid 4→5 data-progress', mid45Progress)
  await page.waitForTimeout(800)
  await shotViewport(page, 'p2_desktop_mid_4_5.png')

  for (let i = 0; i < 5; i++) {
    await clickStep(page, i)
    await shotViewport(page, `p2_desktop_step${i + 1}.png`)
    const fps = await measureFps(page, 2000)
    fpsReport.desktop[`step${i + 1}`] = fps
    console.log('desktop fps step', i + 1, fps)
  }

  // Full scroll-through for recording
  await scrollToProgress(page, 0)
  await page.waitForTimeout(800)
  for (let p = 0; p <= 20; p++) {
    await scrollToProgress(page, p / 20)
    await page.waitForTimeout(280)
  }
  await clickStep(page, 4)
  await page.waitForTimeout(1200)

  const video = page.video()
  await context.close()
  if (video) {
    const vpath = await video.path()
    console.log('raw video', vpath)
    writeFileSync(join(OUT, 'p2_video_raw_path.txt'), vpath)
  }
}

// —— Phone 390 ——
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await gotoExplainer(page)
  for (let i = 0; i < 5; i++) {
    await clickStep(page, i)
    await shotViewport(page, `p2_phone_step${i + 1}.png`)
    if (i === 2) {
      await page.screenshot({ path: join(OUT, 'p2_phone_step3_full.png'), type: 'png' })
      const fps = await measureFps(page, 2000)
      fpsReport.phone.step3 = fps
    }
  }
  const fps = await measureFps(page, 2000)
  fpsReport.phone.spread = fps
  await context.close()
}

await browser.close()

fpsReport.notes.push('Measured via rAF frame count in-page over ~2s on SwiftShader')
fpsReport.notes.push(
  'Soft-GPU path caps cells ~4.5k and PerformanceMonitor declines FX (full→bloom→off). Real desktop GPUs should sustain full tier.',
)
fpsReport.bundle = {
  main_c988817_ExplainerCanvas_gzip_kb: 393.33,
  branch_ExplainerCanvas_named_gzip_kb: 8.89,
  branch_scenes_lazy_gzip_kb: 4.62,
  branch_PostFX_wrapper_gzip_kb: 0.94,
  branch_postfx_lib_gzip_kb: 20.31,
  branch_drei_shared_gzip_kb: 327.2,
  branch_gsap_lazy_gzip_kb: 43.25,
  branch_3d_payload_approx_gzip_kb: 405.21,
  delta_named_ExplainerCanvas_vs_main_kb: -384.44,
  delta_total_3d_vs_main_kb: 11.88,
}
writeFileSync(join(OUT, 'p2_fps_bundle_report.json'), JSON.stringify(fpsReport, null, 2))
console.log(JSON.stringify(fpsReport, null, 2))
console.log('done')
