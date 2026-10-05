import { useMemo, useRef, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AnatomyTorso, landmark } from './AnatomyTorso'
import { CinematicLight } from './CinematicLight'
import { COLORS } from './colors'
import { InstancedTumorCells } from './InstancedTumorCells'
import {
  axillaryPathCurve,
  blendBetween,
  stepWeight,
  stepIndexFromProgress,
} from './scrollPath'
import {
  InsideNodeScene,
  SurgeryScene,
  PatchesScene,
  type DepositMode,
  type SceneQuality,
} from './scenes'

type Props = {
  progress: number
  quality: SceneQuality
  reducedMotion: boolean
  activeNode: string | null
  onActiveNode: (id: string | null) => void
  surgeryMode: 'slnb' | 'alnd' | 'both'
  depositMode: DepositMode
  particleCount: number
}

/**
 * Tube vessel with a scrolling emissive “flow” band along the path.
 * Reduced-motion: steady glow, no scroll.
 */
function PulsingVessel({
  curve,
  quality,
  intensity,
  reducedMotion,
}: {
  curve: THREE.CatmullRomCurve3
  quality: SceneQuality
  intensity: number
  reducedMotion: boolean
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const geom = useMemo(
    () => new THREE.TubeGeometry(curve, quality === 'high' ? 96 : 40, 0.028, 8, false),
    [curve, quality],
  )
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.vessel,
      emissive: COLORS.vesselGlow,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
      roughness: 0.4,
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFlow = { value: 0 }
      shader.uniforms.uPulse = { value: 0.8 }
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vPathU;`,
        )
        .replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
          vPathU = uv.x;`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying float vPathU;
          uniform float uFlow;
          uniform float uPulse;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float band = smoothstep(0.0, 0.12, fract(vPathU * 4.0 - uFlow))
                     * (1.0 - smoothstep(0.18, 0.38, fract(vPathU * 4.0 - uFlow)));
          totalEmissiveRadiance += emissive * (0.55 + band * 1.4) * uPulse;`,
        )
      mat.userData.shader = shader
    }
    mat.customProgramCacheKey = () => 'vessel-flow-v2'
    return mat
  }, [])

  useFrame(({ clock }) => {
    const sh = material.userData.shader as
      | { uniforms: { uFlow: { value: number }; uPulse: { value: number } } }
      | undefined
    const t = clock.getElapsedTime()
    const pulse = reducedMotion ? 0.85 : 0.55 + 0.45 * Math.sin(t * 3.2)
    material.emissiveIntensity = (0.5 + pulse * 0.9) * Math.max(0.25, intensity)
    material.opacity = 0.55 + 0.4 * intensity
    if (sh) {
      sh.uniforms.uFlow.value = reducedMotion ? 0 : t * 0.55
      sh.uniforms.uPulse.value = pulse * Math.max(0.25, intensity)
    }
  })

  return (
    <mesh ref={mesh} geometry={geom} material={material} renderOrder={11} />
  )
}

function AxillaNodes({
  quality,
  progress,
  activeNode,
  onActiveNode,
  surgeryMode,
  sentinelHot,
}: {
  quality: SceneQuality
  progress: number
  activeNode: string | null
  onActiveNode: (id: string | null) => void
  surgeryMode: 'slnb' | 'alnd' | 'both'
  sentinelHot: number
}) {
  const segs = quality === 'high' ? 24 : 12
  const wEarly = stepWeight(progress, 0) + stepWeight(progress, 1)
  const wSurgery = stepWeight(progress, 3)
  const intoNode = blendBetween(progress, 1, 2)
  const toPatches = blendBetween(progress, 3, 4)
  const show = wEarly + wSurgery > 0.05 && intoNode < 0.55 && toPatches < 0.55
  if (!show) return null

  const nodes = [
    { id: 'sentinel', pos: landmark('sentinel'), r: 0.095, level: 1 },
    { id: 'level2', pos: landmark('level2'), r: 0.078, level: 2 },
    { id: 'level3', pos: landmark('level3'), r: 0.07, level: 3 },
  ] as const

  const slnb = surgeryMode === 'slnb' || surgeryMode === 'both'
  const alnd = surgeryMode === 'alnd' || surgeryMode === 'both'

  return (
    <group>
      {nodes.map((n) => {
        const interactive = wEarly > 0.35
        const hot = interactive && activeNode === n.id
        const isSentinel = n.id === 'sentinel'
        let lift = 1
        let dim = 1
        if (wSurgery > 0.2) {
          if (slnb && !alnd) {
            lift = isSentinel ? 1.35 : 0.7
            dim = isSentinel ? 1 : 0.25
          } else if (alnd && !slnb) {
            lift = n.level <= 2 ? 1.3 : 0.65
            dim = n.level <= 2 ? 1 : 0.2
          } else {
            lift = isSentinel ? 1.28 : n.level === 2 ? 1.15 : 0.75
            dim = isSentinel ? 1 : n.level === 2 ? 0.75 : 0.28
          }
        }
        const emissiveBoost = isSentinel ? sentinelHot * 1.6 : 0
        return (
          <mesh
            key={n.id}
            position={n.pos}
            scale={(hot ? 1.2 : 1) * lift * (1 + (isSentinel ? sentinelHot * 0.18 : 0))}
            renderOrder={12}
            onPointerOver={
              interactive
                ? (e) => {
                    e.stopPropagation()
                    onActiveNode(n.id)
                  }
                : undefined
            }
            onPointerOut={interactive ? () => onActiveNode(null) : undefined}
            onClick={
              interactive
                ? (e) => {
                    e.stopPropagation()
                    onActiveNode(hot ? null : n.id)
                  }
                : undefined
            }
          >
            <sphereGeometry args={[n.r, segs, segs]} />
            <meshStandardMaterial
              color={hot || isSentinel ? COLORS.sentinel : COLORS.node}
              emissive={COLORS.sentinel}
              emissiveIntensity={(hot ? 1.15 : isSentinel ? 0.75 : 0.35) * dim + emissiveBoost}
              transparent
              opacity={0.35 + 0.65 * dim}
              depthWrite={false}
              toneMapped={false}
              roughness={0.35}
            />
          </mesh>
        )
      })}
    </group>
  )
}

/**
 * Strict fade-through-dark handoff: outgoing clears before mid-blend, incoming
 * rises after. Midpoint is intentionally dark so 2→3 / 3→4 never jump torso→node.
 * Sidebar text switches at the same midpoint via stepIndexFromProgress.
 */
function sequentialFade(t: number): { out: number; inn: number } {
  const c = THREE.MathUtils.clamp(t, 0, 1)
  const out = 1 - THREE.MathUtils.smoothstep(c, 0.0, 0.48)
  const inn = THREE.MathUtils.smoothstep(c, 0.52, 1.0)
  return { out, inn }
}

/**
 * Multiplies material opacities for a fade without remounting. Stores each
 * material's true base on userData so remounts after a fade-out cannot capture
 * a near-zero opacity as the new base (which left the torso invisible).
 */
function FadeGroup({
  opacity,
  children,
}: {
  opacity: number
  children: ReactNode
}) {
  const ref = useRef<THREE.Group>(null)

  useFrame(() => {
    const root = ref.current
    if (!root) return
    const o = THREE.MathUtils.clamp(opacity, 0, 1)
    root.visible = o > 0.02
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        if (!m) continue
        const mat = m as THREE.Material & {
          opacity?: number
          transparent?: boolean
          userData: Record<string, unknown>
        }
        if (typeof mat.opacity !== 'number') continue
        if (typeof mat.userData.fadeBase !== 'number') {
          mat.userData.fadeBase = mat.opacity
        }
        const b = mat.userData.fadeBase as number
        mat.opacity = b * o
        mat.transparent = mat.opacity < 0.999
      }
    })
  })

  useEffect(() => {
    const root = ref.current
    return () => {
      if (!root) return
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (!mesh.isMesh) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          if (!m) continue
          const mat = m as THREE.Material & {
            opacity?: number
            transparent?: boolean
            userData: Record<string, unknown>
          }
          if (typeof mat.userData.fadeBase === 'number' && typeof mat.opacity === 'number') {
            mat.opacity = mat.userData.fadeBase
            mat.transparent = mat.opacity < 0.999
            delete mat.userData.fadeBase
          }
        }
      })
    }
  }, [])

  return <group ref={ref}>{children}</group>
}

/**
 * Continuous world scrubbed by scroll progress.
 * 1→2 cell stream · 2→3 opacity crossfade into node · 3→4 reverse · 4→5 mosaic.
 * No clip planes, no geometric dive, no tiny→huge scale through the camera.
 */
export function CinematicWorld({
  progress,
  quality,
  reducedMotion,
  activeNode,
  onActiveNode,
  surgeryMode,
  depositMode,
  particleCount,
}: Props) {
  const path = useMemo(() => axillaryPathCurve(), [])
  const [sentinelHot, setSentinelHot] = useState(0)
  const onArrive = useCallback((s: number) => setSentinelHot(s), [])

  const toSpread = blendBetween(progress, 0, 1)
  const intoNode = blendBetween(progress, 1, 2)
  const outOfNode = blendBetween(progress, 2, 3)
  const toPatches = blendBetween(progress, 3, 4)

  // Active + next (and previous during reverse blends) — never keep far scenes live.
  const activeIdx = stepIndexFromProgress(progress)
  const live = new Set<number>([
    activeIdx,
    Math.max(0, activeIdx - 1),
    Math.min(4, activeIdx + 1),
  ])

  const dive = sequentialFade(intoNode)
  const pull = sequentialFade(outOfNode)
  const mosaic = sequentialFade(toPatches)

  // Torso: steps 0–1, fades out as camera pushes toward the sentinel.
  const torsoOpacity = THREE.MathUtils.clamp(dive.out * (outOfNode < 0.02 ? 1 : 0), 0, 1)
  const showTorso = (live.has(0) || live.has(1)) && torsoOpacity > 0.02

  // Node: fades in at rest framing (scale 0.9→1.0); fades out before surgery rises.
  const nodeOpacity = THREE.MathUtils.clamp(dive.inn * pull.out * mosaic.out, 0, 1)
  const nodeScale = THREE.MathUtils.lerp(0.9, 1.0, THREE.MathUtils.smoothstep(dive.inn, 0, 1))
  const showNode = (live.has(2) || nodeOpacity > 0.02) && nodeOpacity > 0.02

  // Surgery panels
  const surgeryOpacity = THREE.MathUtils.clamp(pull.inn * mosaic.out, 0, 1)
  const showSurgery = (live.has(3) || surgeryOpacity > 0.02) && surgeryOpacity > 0.02

  // Patches
  const patchesOpacity = THREE.MathUtils.clamp(mosaic.inn, 0, 1)
  const showPatches = (live.has(4) || patchesOpacity > 0.02) && patchesOpacity > 0.02

  const cellIntensity = THREE.MathUtils.clamp(
    toSpread * 0.55 +
      stepWeight(progress, 1, 0.16) * 0.9 -
      intoNode * 1.05 -
      toPatches,
    0,
    1,
  )
  const vesselIntensity =
    Math.max(
      0.15,
      stepWeight(progress, 0) * 0.85 + stepWeight(progress, 1) * 1.25,
    ) *
    torsoOpacity

  return (
    <group>
      {showTorso && (
        <group>
          <CinematicLight quality={quality} />
          {/* Fade only the torso mesh subtree — vessels/cells already track intensity. */}
          <FadeGroup opacity={torsoOpacity}>
            <AnatomyTorso
              quality={quality}
              showTumor={stepWeight(progress, 0) + stepWeight(progress, 1) > 0.12}
              showBreast
              dimmed={torsoOpacity < 0.65}
            />
          </FadeGroup>
          {vesselIntensity > 0.08 && (
            <PulsingVessel
              curve={path}
              quality={quality}
              intensity={vesselIntensity}
              reducedMotion={reducedMotion}
            />
          )}
          <AxillaNodes
            quality={quality}
            progress={progress}
            activeNode={activeNode}
            onActiveNode={onActiveNode}
            surgeryMode={surgeryMode}
            sentinelHot={sentinelHot}
          />
          {cellIntensity > 0.04 && (
            <InstancedTumorCells
              curve={path}
              count={particleCount}
              reducedMotion={reducedMotion}
              intensity={cellIntensity}
              onArrive={onArrive}
            />
          )}
        </group>
      )}

      {showNode && (
        <group scale={nodeScale} position={[0, 0.05, 0]}>
          <InsideNodeScene
            quality={quality}
            reducedMotion={reducedMotion}
            activeNode={null}
            onActiveNode={() => undefined}
            depositMode={depositMode}
            hudVisible={nodeOpacity > 0.6}
            sceneOpacity={nodeOpacity}
          />
        </group>
      )}

      {showSurgery && (
        <FadeGroup opacity={surgeryOpacity}>
          <SurgeryScene
            quality={quality}
            reducedMotion={reducedMotion}
            activeNode={null}
            onActiveNode={() => undefined}
            surgeryMode={surgeryMode}
            hudVisible={surgeryOpacity > 0.55}
          />
        </FadeGroup>
      )}

      {showPatches && (
        <group scale={0.92 + patchesOpacity * 0.08}>
          <PatchesScene
            quality={quality}
            reducedMotion={reducedMotion}
            activeNode={null}
            onActiveNode={() => undefined}
            hudVisible={patchesOpacity > 0.5}
          />
        </group>
      )}
    </group>
  )
}
