/**
 * One-shot GPU probes. Never call getContext('webgl') per-render — Chromium
 * caps concurrent WebGL contexts (~8–16); leaking them loses the canvas and
 * crashes EffectComposer (null .alpha) which unmounts the whole React tree.
 */

let softGpuCache: boolean | null = null
let webglSupportCache: boolean | null = null

function probeRenderer(): string {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl')
    if (!gl || !(gl instanceof WebGLRenderingContext)) return ''
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : ''
    // Release the probe context immediately so it does not count against the cap.
    const lose = gl.getExtension('WEBGL_lose_context')
    lose?.loseContext()
    return renderer
  } catch {
    return ''
  }
}

/** Soft / software / integrated GPUs that need lighter particle + FX budgets. */
export function isSoftGpu(): boolean {
  if (softGpuCache != null) return softGpuCache
  if (typeof navigator === 'undefined') {
    softGpuCache = false
    return softGpuCache
  }
  const ua = navigator.userAgent
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) {
    softGpuCache = true
    return softGpuCache
  }
  softGpuCache = /intel|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe/i.test(probeRenderer())
  return softGpuCache
}

export function detectWebGLSupport(): boolean {
  if (webglSupportCache != null) return webglSupportCache
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    const ok = Boolean(gl)
    if (gl && 'getExtension' in gl) {
      const lose = (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')
      lose?.loseContext()
    }
    webglSupportCache = ok
  } catch {
    webglSupportCache = false
  }
  return webglSupportCache
}
