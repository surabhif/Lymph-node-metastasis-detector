import { Suspense, useEffect, useState } from 'react'
import { EffectComposer, Bloom, Vignette, DepthOfField } from '@react-three/postprocessing'
import { PerformanceMonitor } from '@react-three/drei'
import type { SceneQuality } from './AnatomyTorso'

export type FxTier = 'off' | 'bloom' | 'full'

function detectLowEndGpu(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
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
 * - high desktop: bloom + vignette + subtle DOF on axilla
 * - low / mobile / declined: half-strength bloom, then off
 * Avoid N8AO on the glass torso.
 */
export function PostFX({
  quality,
  reducedMotion,
  enabled = true,
  focusAxilla = false,
  onTierChange,
}: {
  quality: SceneQuality
  reducedMotion: boolean
  enabled?: boolean
  focusAxilla?: boolean
  onTierChange?: (tier: FxTier) => void
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

  useEffect(() => {
    onTierChange?.(tier)
  }, [tier, onTierChange])

  if (tier === 'off') return null

  const useDof = tier === 'full' && focusAxilla && quality === 'high'

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
        <EffectComposer multisampling={tier === 'full' ? 2 : 0} enableNormalPass={false}>
          <Bloom
            luminanceThreshold={0.52}
            luminanceSmoothing={0.45}
            intensity={tier === 'full' ? 0.9 : 0.5}
            mipmapBlur
            levels={tier === 'full' ? 4 : 3}
          />
          {useDof ? (
            <DepthOfField
              focusDistance={0.018}
              focalLength={0.025}
              bokehScale={1.55}
              height={320}
            />
          ) : (
            <></>
          )}
          {tier === 'full' ? (
            <Vignette offset={0.28} darkness={0.48} />
          ) : (
            <Vignette offset={0.3} darkness={0.32} />
          )}
        </EffectComposer>
      </Suspense>
    </>
  )
}
