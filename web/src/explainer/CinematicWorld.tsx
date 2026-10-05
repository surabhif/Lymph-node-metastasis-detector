import { useMemo, useRef, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { AnatomyTorso, landmark } from './AnatomyTorso'
import { CinematicLight } from './CinematicLight'
import { COLORS } from './colors'
import { InstancedTumorCells } from './InstancedTumorCells'
import {
  axillaryPathCurve,
  blendBetween,
  stepWeight,
} from './scrollPath'
import {
  InsideNodeScene,
  PatchesScene,
  SurgeryScene,
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
  // Hide while deep inside the node or on patches
  const intoNode = blendBetween(progress, 1, 2)
  const toPatches = blendBetween(progress, 3, 4)
  const show = wEarly + wSurgery > 0.05 && intoNode < 0.75 && toPatches < 0.55
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
 * Moving clip plane for the 2→3 dive: starts sealed in front of the node
 * and sweeps back so the cut-away opens toward camera.
 */
function NodeClipReveal({
  reveal,
  children,
}: {
  reveal: number
  children: ReactNode
}) {
  const { gl } = useThree()
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, -1), 1.4), [])
  const group = useRef<THREE.Group>(null)

  useEffect(() => {
    gl.localClippingEnabled = true
    return () => {
      gl.localClippingEnabled = false
    }
  }, [gl])

  useFrame(() => {
    // reveal 0 → sealed (plane in front); 1 → fully open
    plane.constant = THREE.MathUtils.lerp(1.55, -1.35, THREE.MathUtils.clamp(reveal, 0, 1))
    const root = group.current
    if (!root) return
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        if (!m) continue
        m.clippingPlanes = [plane]
        m.clipShadows = false
        m.needsUpdate = true
      }
    })
  })

  return <group ref={group}>{children}</group>
}

/**
 * Continuous world scrubbed by scroll progress.
 * 1→2 cell stream to sentinel · 2→3 clip-reveal dive into node ·
 * 3→4 pull back to axilla/surgery · 4→5 fade to PCam mosaic.
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

  // Blend weights across the five snaps (0, 0.25, 0.5, 0.75, 1)
  const toSpread = blendBetween(progress, 0, 1) // 1→2
  const intoNode = blendBetween(progress, 1, 2) // 2→3
  const outOfNode = blendBetween(progress, 2, 3) // 3→4
  const toPatches = blendBetween(progress, 3, 4) // 4→5

  // Torso lives through steps 1–4; fades as we enter node and again into patches
  const torsoFade = Math.max(
    0,
    1 - intoNode * 0.92 - Math.max(0, intoNode - 0.85) * 2,
  ) * (1 - toPatches)
  // After leaving the node, torso returns for surgery before patches
  const torsoReturn = outOfNode * (1 - toPatches) * (1 - Math.min(1, intoNode * 1.1))
  const torsoAmt = THREE.MathUtils.clamp(Math.max(torsoFade, torsoReturn * 0.95), 0, 1)

  const nodeAmt = THREE.MathUtils.clamp(
    intoNode * (1 - outOfNode * 0.95) * (1 - toPatches),
    0,
    1,
  )
  // Clip opens with dive; reduced-motion snaps open via cross-fade only
  const clipReveal = reducedMotion ? (intoNode > 0.45 ? 1 : 0) : intoNode

  const surgeryAmt = THREE.MathUtils.clamp(
    outOfNode * (1 - toPatches) * (intoNode > 0.5 ? 1 : outOfNode),
    0,
    1,
  )
  // Prefer dual surgery panels once we've pulled back from the node
  const surgeryPanelAmt = THREE.MathUtils.clamp((outOfNode - 0.35) / 0.55, 0, 1) * (1 - toPatches)

  const patchesAmt = toPatches

  const cellIntensity = THREE.MathUtils.clamp(
    toSpread * 0.55 +
      stepWeight(progress, 1, 0.16) * 0.9 -
      intoNode * 1.05 -
      toPatches,
    0,
    1,
  )
  const vesselIntensity = Math.max(
    0.15,
    stepWeight(progress, 0) * 0.85 +
      stepWeight(progress, 1) * 1.25 +
      stepWeight(progress, 3) * 0.45,
  ) * (1 - intoNode * 0.85) * (1 - toPatches)

  const showTorso = torsoAmt > 0.04 && surgeryPanelAmt < 0.92
  const showNode = nodeAmt > 0.06
  const showSurgery = surgeryPanelAmt > 0.08
  const showPatches = patchesAmt > 0.06

  // Soft scale/position for the dive into the node
  const torsoScale = 1 - intoNode * 0.42 + outOfNode * 0.35 * (1 - toPatches)
  const torsoY = -intoNode * 0.22 + outOfNode * 0.12

  return (
    <group>
      {showTorso && (
        <group scale={Math.max(0.35, torsoScale)} position={[0, torsoY, 0]}>
          <CinematicLight quality={quality} />
          <AnatomyTorso
            quality={quality}
            showTumor={stepWeight(progress, 0) + stepWeight(progress, 1) > 0.12}
            showBreast
            dimmed={intoNode > 0.35 || surgeryAmt > 0.45 || torsoAmt < 0.55}
          />
          {vesselIntensity > 0.08 && (
            <PulsingVessel
              curve={path}
              quality={quality}
              intensity={vesselIntensity * torsoAmt}
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
        <group
          position={[0, 0.05 - (1 - nodeAmt) * 0.1, 0]}
          scale={0.4 + nodeAmt * 0.85}
        >
          <NodeClipReveal reveal={clipReveal}>
            <InsideNodeScene
              quality={quality}
              reducedMotion={reducedMotion}
              activeNode={null}
              onActiveNode={() => undefined}
              depositMode={depositMode}
            />
          </NodeClipReveal>
        </group>
      )}

      {showSurgery && (
        <group
          scale={0.75 + surgeryPanelAmt * 0.28}
          // Soft bring-up of dual panels as we leave the node
          position={[0, (1 - surgeryPanelAmt) * 0.15, 0]}
        >
          <SurgeryScene
            quality={quality}
            reducedMotion={reducedMotion}
            activeNode={null}
            onActiveNode={() => undefined}
            surgeryMode={surgeryMode}
          />
        </group>
      )}

      {showPatches && (
        <group scale={0.82 + patchesAmt * 0.22} position={[0, (1 - patchesAmt) * -0.2, 0]}>
          <PatchesScene
            quality={quality}
            reducedMotion={reducedMotion}
            activeNode={null}
            onActiveNode={() => undefined}
          />
        </group>
      )}
    </group>
  )
}
