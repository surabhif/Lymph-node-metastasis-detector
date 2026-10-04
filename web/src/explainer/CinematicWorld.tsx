import { useMemo, useRef, useState, useCallback } from 'react'
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
} from './scrollPath'
import {
  InsideNodeScene,
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

function PulsingVessel({
  curve,
  quality,
  intensity,
}: {
  curve: THREE.CatmullRomCurve3
  quality: SceneQuality
  intensity: number
}) {
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const geom = useMemo(
    () => new THREE.TubeGeometry(curve, quality === 'high' ? 96 : 40, 0.028, 8, false),
    [curve, quality],
  )
  useFrame(({ clock }) => {
    if (!mat.current) return
    const pulse = 0.55 + 0.45 * Math.sin(clock.getElapsedTime() * 3.2)
    mat.current.emissiveIntensity = (0.5 + pulse * 0.9) * Math.max(0.25, intensity)
    mat.current.opacity = 0.55 + 0.4 * intensity
  })
  return (
    <mesh geometry={geom} renderOrder={11}>
      <meshStandardMaterial
        ref={mat}
        color={COLORS.vessel}
        emissive={COLORS.vesselGlow}
        emissiveIntensity={0.8}
        transparent
        opacity={0.85}
        depthWrite={false}
        toneMapped={false}
        roughness={0.4}
      />
    </mesh>
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
  const w1 = stepWeight(progress, 0) + stepWeight(progress, 1)
  const w4 = stepWeight(progress, 3)
  const show = w1 + w4 > 0.05
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
        const interactive = w1 > 0.4
        const hot = interactive && activeNode === n.id
        const isSentinel = n.id === 'sentinel'
        // Step 4: lift selected nodes, dim the rest
        let lift = 1
        let dim = 1
        if (w4 > 0.2) {
          if (slnb && !alnd) {
            lift = isSentinel ? 1.35 : 0.7
            dim = isSentinel ? 1 : 0.25
          } else if (alnd && !slnb) {
            lift = n.level <= 2 ? 1.3 : 0.65
            dim = n.level <= 2 ? 1 : 0.2
          } else {
            // both / comparison: sentinel brightest, L2 medium, L3 faint
            lift = isSentinel ? 1.28 : n.level === 2 ? 1.15 : 0.75
            dim = isSentinel ? 1 : n.level === 2 ? 0.75 : 0.28
          }
        }
        const emissiveBoost = isSentinel ? sentinelHot * 1.4 : 0
        return (
          <mesh
            key={n.id}
            position={n.pos}
            scale={(hot ? 1.2 : 1) * lift}
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
 * One continuous world scrubbed by scroll progress.
 * Torso + vessels dominate early; cut-away node cross-fades in for step 3;
 * surgery highlight on one body for step 4; patches fade in for step 5.
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

  const torsoOpacity = 1 - blendBetween(progress, 1, 2) * 0.85
  const nodeReveal = blendBetween(progress, 1, 2) // 2→3
  const torsoOut = blendBetween(progress, 3, 4) // 4→5
  const patchesIn = torsoOut
  const cellIntensity =
    stepWeight(progress, 1, 0.18) * 0.55 +
    stepWeight(progress, 1, 0.1) * 0.45 +
    blendBetween(progress, 0, 1) * 0.35 -
    nodeReveal * 0.9
  const cellAmt = THREE.MathUtils.clamp(cellIntensity, 0, 1)
  const vesselIntensity = Math.max(0.2, stepWeight(progress, 0) + stepWeight(progress, 1) * 1.2)

  // Moving clipping plane for the cut-away reveal (world +Z opens as we dive in)
  const clipRef = useRef(0)
  useFrame(() => {
    clipRef.current = THREE.MathUtils.lerp(clipRef.current, -1.2 + nodeReveal * 2.4, 0.12)
  })

  const showTorso = torsoOut < 0.92
  const showNode = nodeReveal > 0.08 && torsoOut < 0.85
  const showPatches = patchesIn > 0.12

  return (
    <group>
      {showTorso && (
        <group
          visible={torsoOpacity > 0.04}
          // soft scale-down as we dive into the node
          scale={1 - nodeReveal * 0.35}
          position={[0, -nodeReveal * 0.15, 0]}
        >
          <CinematicLight quality={quality} />
          <group>
            {/* Dim torso under glass as scroll progresses into the node */}
            <AnatomyTorso
              quality={quality}
              showTumor={stepWeight(progress, 0) + stepWeight(progress, 1) > 0.15}
              showBreast
              dimmed={nodeReveal > 0.45 || stepWeight(progress, 3) > 0.5}
            />
          </group>
          <PulsingVessel curve={path} quality={quality} intensity={vesselIntensity * (1 - nodeReveal)} />
          <AxillaNodes
            quality={quality}
            progress={progress}
            activeNode={activeNode}
            onActiveNode={onActiveNode}
            surgeryMode={surgeryMode}
            sentinelHot={sentinelHot}
          />
          {cellAmt > 0.05 && (
            <InstancedTumorCells
              curve={path}
              count={particleCount}
              reducedMotion={reducedMotion}
              intensity={cellAmt}
              onArrive={onArrive}
            />
          )}
        </group>
      )}

      {showNode && (
        <group position={[0, 0.05, 0]} scale={0.35 + nodeReveal * 0.75}>
          <InsideNodeScene
            quality={quality}
            reducedMotion={reducedMotion}
            activeNode={null}
            onActiveNode={() => undefined}
            depositMode={depositMode}
          />
        </group>
      )}

      {showPatches && (
        <group position={[0, 0, 0]} scale={0.85 + patchesIn * 0.2}>
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
