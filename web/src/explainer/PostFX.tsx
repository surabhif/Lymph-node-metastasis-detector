import { Suspense, useEffect, useState } from 'react'
import { EffectComposer, Bloom, Vignette, N8AO } from '@react-three/postprocessing'
import { PerformanceMonitor } from '@react-three/drei'
import type { SceneQuality } from './AnatomyTorso'

export type FxTier = 'off' | 'bloom' | 'full'

function detectLowEndGpu(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // Rough mobile / integrated-GPU heuristic; refined by PerformanceMonitor.
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return true
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl || !(gl instanceof WebGLRenderingContext)) return false
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    if (!dbg) return false
    const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '').toLowerCase()
    return /intel|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe/.test(renderer)
  } catch {
    return false
  }
}

/**
 * Light post-processing with an auto quality tier.
 * - high desktop: bloom + soft AO + vignette
 * - low / mobile / declined: bloom only, then off
 * Respects prefers-reduced-motion by skipping entirely when reducedMotion.
 */
export function PostFX({
  quality,
  reducedMotion,
  enabled = true,
}: {
  quality: SceneQuality
  reducedMotion: boolean
  enabled?: boolean
}) {
  const [tier, setTier] = useState<FxTier>(() => {
    if (reducedMotion || !enabled) return 'off'
    if (quality === 'low' || detectLowEndGpu()) return 'bloom'
    return 'full'
  })

  useEffect(() => {
    if (reducedMotion || !enabled) {
      setTier('off')
      return
    }
    setTier(quality === 'low' || detectLowEndGpu() ? 'bloom' : 'full')
  }, [quality, reducedMotion, enabled])

  if (tier === 'off') return null

  return (
    <>
      <PerformanceMonitor
        onDecline={() => setTier((t) => (t === 'full' ? 'bloom' : 'off'))}
        onIncline={() => {
          if (quality === 'high' && !reducedMotion && enabled) setTier('full')
        }}
        flipflops={3}
        bounds={(fps) => (fps < 28 ? [0, 28] : [45, 90])}
      />
      <Suspense fallback={null}>
        <EffectComposer multisampling={tier === 'full' ? 4 : 0} enableNormalPass={tier === 'full'}>
          <Bloom
            luminanceThreshold={0.72}
            luminanceSmoothing={0.35}
            intensity={tier === 'full' ? 0.55 : 0.35}
            mipmapBlur
          />
          {tier === 'full' ? (
            <N8AO aoRadius={0.45} intensity={0.55} distanceFalloff={0.6} quality="performance" />
          ) : (
            <></>
          )}
          {tier === 'full' ? <Vignette offset={0.28} darkness={0.42} /> : <></>}
        </EffectComposer>
      </Suspense>
    </>
  )
}
