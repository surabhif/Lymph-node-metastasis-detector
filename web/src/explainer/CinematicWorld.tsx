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
  SurgeryScene,
  PatchesScene,
  type DepositMode,
  type SceneQuality,
} from './scenes'

/** Front-load a 0→1 blend so mid-scroll already shows the destination scene. */
function easeOutBlend(t: number, power = 1.55): number {
  const c = THREE.MathUtils.clamp(t, 0, 1)
  return 1 - Math.pow(1 - c, power)
}

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
  const localPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 1.15), [])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 1.15), [])
  const group = useRef<THREE.Group>(null)

  useEffect(() => {
    gl.localClippingEnabled = true
    return () => {
      gl.localClippingEnabled = false
    }
  }, [gl])

  useFrame(() => {
    // Plane normal +Z in node-local space: clip when local z > -constant.
    // Sealed (reveal=0): constant≈0.95 → thin sealed slab
    // Open (reveal=1): constant≈-1.6 → whole node visible
    // Ease the sweep so follicles appear mid-dive, not only at the end.
    const r = THREE.MathUtils.clamp(reveal, 0, 1)
    const eased = 1 - Math.pow(1 - r, 1.35)
    localPlane.normal.set(0, 0, 1)
    localPlane.constant = THREE.MathUtils.lerp(0.95, -1.6, eased)
    const root = group.current
    if (!root) return
    root.updateWorldMatrix(true, false)
    plane.copy(localPlane).applyMatrix4(root.matrixWorld)
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      // Flat cut-face rings / vessels ahead of the cut skip clipping to avoid dashed z-fight
      if (mesh.userData?.skipClip) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const m of mats) {
          if (!m) continue
          m.clippingPlanes = []
          m.needsUpdate = true
        }
        return
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) {
        if (!m) continue
        m.clippingPlanes = reveal >= 0.85 ? [] : [plane]
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
  // Once a scene has been needed, keep meshes mounted (no remount pop) but gate Html via hudVisible.
  const [warmNode, setWarmNode] = useState(false)
  const [warmSurgery, setWarmSurgery] = useState(false)
  const [warmPatches, setWarmPatches] = useState(false)

  // Blend weights across the five snaps (0, 0.25, 0.5, 0.75, 1).
  // Front-load destination blends so mid-scroll (and stepIndex midpoints) already show the dive/crossfade.
  const toSpread = blendBetween(progress, 0, 1) // 1→2
  // Stronger front-load so mid-scroll (0.375) already frames the open cut-away.
  const intoNode = easeOutBlend(blendBetween(progress, 1, 2), 2.1) // 2→3 dive
  const outOfNode = easeOutBlend(blendBetween(progress, 2, 3), 1.45) // 3→4 pull-back
  const toPatches = easeOutBlend(blendBetween(progress, 3, 4), 1.5) // 4→5 cross-fade

  useEffect(() => {
    if (progress > 0.18 || intoNode > 0.02) setWarmNode(true)
    if (progress > 0.4 || outOfNode > 0.02) setWarmSurgery(true)
    if (progress > 0.62 || toPatches > 0.02) setWarmPatches(true)
  }, [progress, intoNode, outOfNode, toPatches])

  // Torso yields quickly once the dive starts; returns for surgery before patches.
  const torsoFade = Math.max(0, 1 - intoNode * 1.15) * (1 - toPatches)
  const torsoReturn = outOfNode * (1 - toPatches) * (1 - Math.min(1, intoNode * 1.05))
  const torsoAmt = THREE.MathUtils.clamp(Math.max(torsoFade, torsoReturn * 0.95), 0, 1)

  const nodeAmt = THREE.MathUtils.clamp(
    intoNode * (1 - outOfNode * 0.92) * (1 - toPatches),
    0,
    1,
  )
  // Delay clip/cap until the camera is inside node scale — mid-dive sphere
  // cross-sections otherwise read as a solid pink disc slicing the torso.
  const clipReveal = reducedMotion
    ? intoNode > 0.72
      ? 1
      : 0
    : THREE.MathUtils.smoothstep(intoNode, 0.78, 0.98) *
      THREE.MathUtils.clamp(1 - outOfNode * 1.35, 0, 1)
  // Flat cortex/cap discs only once fully inside (and fade on pull-out)
  const cutFaceAmt =
    THREE.MathUtils.smoothstep(intoNode, 0.82, 0.98) *
    THREE.MathUtils.clamp(1 - outOfNode * 1.25, 0, 1)

  const surgeryAmt = THREE.MathUtils.clamp(
    outOfNode * (1 - toPatches),
    0,
    1,
  )
  // Dual surgery panels after leaving the node; fade as patches take over.
  const surgeryPanelAmt =
    THREE.MathUtils.smoothstep(outOfNode, 0.12, 0.78) *
    THREE.MathUtils.clamp(1 - toPatches * 1.35, 0, 1)

  // Patches rise across the 4→5 window so mid scrub is a real cross-fade.
  const patchesAmt = THREE.MathUtils.smoothstep(toPatches, 0.02, 0.82)

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

  // Keep scenes mounted (no Suspense pop-in) and drive visibility from blend amounts.
  const showTorso = torsoAmt > 0.02 && patchesAmt < 0.9
  const showNode = nodeAmt > 0.02 && patchesAmt < 0.28
  const showSurgery = surgeryPanelAmt > 0.02 && patchesAmt < 0.9
  const showPatches = patchesAmt > 0.02

  // Soft scale/position for the dive into the node — rest scale must be 1 (camera is fitted to unit node)
  const torsoScale = 1 - intoNode * 0.7 + outOfNode * 0.35 * (1 - toPatches)
  const torsoY = -intoNode * 0.35 + outOfNode * 0.12
  const nodeScale = THREE.MathUtils.lerp(0.38, 1.0, intoNode) * (1 - outOfNode * 0.42)
  // Pull the cut-away out of the axilla toward origin early so mid-scroll frames it.
  const sent = landmark('sentinel')
  const seat = Math.pow(1 - intoNode, 1.55)
  const nodePos: [number, number, number] = [
    sent[0] * seat,
    sent[1] * seat + 0.05 - (1 - nodeAmt) * 0.08,
    sent[2] * seat + intoNode * 0.18,
  ]

  return (
    <group>
      {showTorso && (
        <group
          scale={Math.max(0.35, torsoScale)}
          position={[0, torsoY, 0]}
          visible={torsoAmt > 0.04}
        >
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

      {/* Warm-mounted meshes; Html HUDs gated so portals cannot leak across steps */}
      {(warmNode || showNode) && (
        <group
          position={nodePos}
          scale={Math.max(0.28, nodeScale)}
          visible={showNode}
        >
          <NodeClipReveal reveal={clipReveal}>
            <InsideNodeScene
              quality={quality}
              reducedMotion={reducedMotion}
              activeNode={null}
              onActiveNode={() => undefined}
              depositMode={depositMode}
              hudVisible={showNode && nodeAmt > 0.35}
              cutFaceAmt={cutFaceAmt}
            />
          </NodeClipReveal>
        </group>
      )}

      {(warmSurgery || showSurgery) && (
        <group
          scale={0.75 + surgeryPanelAmt * 0.28}
          position={[0, (1 - surgeryPanelAmt) * 0.15, 0]}
          visible={showSurgery}
        >
          <SurgeryScene
            quality={quality}
            reducedMotion={reducedMotion}
            activeNode={null}
            onActiveNode={() => undefined}
            surgeryMode={surgeryMode}
            hudVisible={showSurgery}
          />
        </group>
      )}

      {(warmPatches || showPatches) && (
        <group
          scale={0.82 + patchesAmt * 0.22}
          position={[0, (1 - patchesAmt) * -0.2, 0]}
          visible={showPatches}
        >
          <PatchesScene
            quality={quality}
            reducedMotion={reducedMotion}
            activeNode={null}
            onActiveNode={() => undefined}
            hudVisible={showPatches && patchesAmt > 0.45}
          />
        </group>
      )}
    </group>
  )
}
