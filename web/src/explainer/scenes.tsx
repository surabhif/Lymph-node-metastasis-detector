import { useMemo, useRef, useEffect, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import * as THREE from 'three'
import type { ExplainerStepId } from './steps'
import { COLORS } from './colors'
import { AnatomyTorso, landmark } from './AnatomyTorso'

export type SceneQuality = 'high' | 'low'

type SceneProps = {
  quality: SceneQuality
  reducedMotion: boolean
  activeNode: string | null
  onActiveNode: (id: string | null) => void
}

export function SoftLight() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#f7f2e8', '#9aabb0', 0.55]} />
      <directionalLight position={[4.2, 6.5, 3.2]} intensity={1.15} color="#fff4e6" />
      <directionalLight position={[-3.5, 2.2, -2.5]} intensity={0.38} color="#b7c9c0" />
      <pointLight position={[0.9, 1.1, 1.9]} intensity={0.32} color="#ffe8d6" />
    </>
  )
}

function IdleSpin({
  reducedMotion,
  speed = 0.1,
  children,
}: {
  reducedMotion: boolean
  speed?: number
  children: ReactNode
}) {
  const ref = useRef<Group>(null)
  useEffect(() => {
    // Start with the patient-right axilla facing the default camera
    if (ref.current) ref.current.rotation.y = -0.55
  }, [])
  useFrame((_, dt) => {
    if (reducedMotion || !ref.current) return
    ref.current.rotation.y += dt * speed
  })
  return <group ref={ref}>{children}</group>
}

/**
 * Axillary drainage path anchored to BodyParts3D landmarks (patient-right = −X):
 * tumor (breast UOQ) → under skin → Level I (lateral to pec minor) →
 * Level II (behind pec minor) → Level III (medial, infraclavicular).
 */
function axillaryPath() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(...landmark('tumor')),
    new THREE.Vector3(...landmark('vessel_mid1')),
    new THREE.Vector3(...landmark('vessel_mid2')),
    new THREE.Vector3(...landmark('sentinel')),
    new THREE.Vector3(...landmark('level2')),
    new THREE.Vector3(...landmark('level3')),
  ])
}

const AXILLA_NODES = [
  { id: 'sentinel', pos: landmark('sentinel'), r: 0.095 },
  { id: 'level2', pos: landmark('level2'), r: 0.078 },
  { id: 'level3', pos: landmark('level3'), r: 0.07 },
] as const

function LymphTube({
  curve,
  radius,
  tubular,
  color,
  opacity = 1,
}: {
  curve: THREE.Curve<THREE.Vector3>
  radius: number
  tubular: number
  color: string
  opacity?: number
}) {
  const geom = useMemo(
    () => new THREE.TubeGeometry(curve, tubular, radius, 8, false),
    [curve, tubular, radius],
  )
  return (
    <mesh geometry={geom}>
      <meshStandardMaterial
        color={color}
        roughness={0.45}
        metalness={0.05}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  )
}

function AxillaryChain({
  quality,
  activeNode,
  onActiveNode,
  interactive,
}: {
  quality: SceneQuality
  activeNode: string | null
  onActiveNode: (id: string | null) => void
  interactive: boolean
}) {
  const segs = quality === 'high' ? 28 : 14
  const path = useMemo(() => axillaryPath(), [])
  const tubular = quality === 'high' ? 64 : 28

  return (
    <group>
      <LymphTube curve={path} radius={0.028} tubular={tubular} color={COLORS.vessel} />
      {AXILLA_NODES.map((n) => {
        const hot = interactive && activeNode === n.id
        const isSentinel = n.id === 'sentinel'
        return (
          <mesh
            key={n.id}
            position={n.pos}
            scale={hot ? 1.22 : 1}
            onPointerOver={
              interactive
                ? (e: ThreeEvent<PointerEvent>) => {
                    e.stopPropagation()
                    onActiveNode(n.id)
                  }
                : undefined
            }
            onPointerOut={interactive ? () => onActiveNode(null) : undefined}
            onClick={
              interactive
                ? (e: ThreeEvent<MouseEvent>) => {
                    e.stopPropagation()
                    onActiveNode(hot ? null : n.id)
                  }
                : undefined
            }
          >
            <sphereGeometry args={[n.r, segs, segs]} />
            <meshStandardMaterial
              color={hot ? COLORS.nodeHot : isSentinel ? COLORS.sentinel : COLORS.node}
              emissive={isSentinel || hot ? COLORS.sentinel : '#000'}
              emissiveIntensity={hot ? 0.32 : isSentinel ? 0.16 : 0}
              roughness={0.36}
            />
          </mesh>
        )
      })}
    </group>
  )
}

/** Step 1 */
export function LymphaticScene({ quality, reducedMotion, activeNode, onActiveNode }: SceneProps) {
  return (
    <IdleSpin reducedMotion={reducedMotion} speed={0.04}>
      <SoftLight />
      <AnatomyTorso quality={quality} />
      <AxillaryChain
        quality={quality}
        activeNode={activeNode}
        onActiveNode={onActiveNode}
        interactive
      />
    </IdleSpin>
  )
}

/** Step 2 */
export function SpreadScene({ quality, reducedMotion }: SceneProps) {
  const path = useMemo(() => axillaryPath(), [])
  const cellCount = quality === 'high' ? 8 : 5
  const cells = useRef<(Mesh | null)[]>([])

  useFrame(({ clock }) => {
    if (reducedMotion) return
    const t = clock.getElapsedTime()
    cells.current.forEach((mesh, i) => {
      if (!mesh) return
      const u = (t * 0.09 + i / cellCount) % 1
      mesh.position.copy(path.getPointAt(u))
      mesh.scale.setScalar(0.7 + 0.3 * Math.sin(t * 2.2 + i))
    })
  })

  return (
    <group>
      <SoftLight />
      <AnatomyTorso quality={quality} />
      <AxillaryChain
        quality={quality}
        activeNode={null}
        onActiveNode={() => undefined}
        interactive={false}
      />
      {Array.from({ length: cellCount }).map((_, i) => {
        const u = reducedMotion ? (i + 0.5) / cellCount : 0
        return (
          <mesh
            key={i}
            ref={(el) => {
              cells.current[i] = el
            }}
            position={path.getPointAt(u)}
          >
            <sphereGeometry args={[0.038, 12, 12]} />
            <meshStandardMaterial
              color={COLORS.tumorCell}
              emissive={COLORS.tumor}
              emissiveIntensity={0.4}
            />
          </mesh>
        )
      })}
    </group>
  )
}

/** Step 3 — open cutaway bowl so legend-matched red deposits stay unobstructed */
export function InsideNodeScene({ quality, reducedMotion }: SceneProps) {
  const segs = quality === 'high' ? 40 : 20
  const group = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (reducedMotion || !group.current) return
    group.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.45) * 0.28
  })

  const deposits = [
    { id: 'itc', pos: [-0.48, 0.38, 0.35] as const, r: 0.065, color: COLORS.itc },
    { id: 'micro', pos: [0.42, -0.02, 0.32] as const, r: 0.17, color: COLORS.micro },
    { id: 'macro', pos: [-0.02, 0.02, 0.22] as const, r: 0.4, color: COLORS.macro },
  ]

  return (
    <group ref={group} position={[0, 0.08, 0]}>
      <ambientLight intensity={0.7} />
      <hemisphereLight args={['#f8f5ef', '#d0d4d0', 0.35]} />
      <directionalLight position={[3.2, 4.5, 5]} intensity={1.15} color="#fff8f0" />
      <directionalLight position={[-2.2, 1.2, 2]} intensity={0.3} color="#f0f2ef" />

      <mesh rotation={[0, Math.PI / 2, 0]}>
        <sphereGeometry args={[1.02, segs, segs, 0, Math.PI, 0, Math.PI]} />
        <meshStandardMaterial
          color={COLORS.lymphoid}
          roughness={0.92}
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[1.02, 0.035, 10, Math.max(24, segs)]} />
        <meshStandardMaterial color={COLORS.nodeCapsule} roughness={0.4} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0, -0.02]}>
        <circleGeometry args={[1.0, segs]} />
        <meshStandardMaterial color="#f4f7f4" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>

      {deposits.map((d) => (
        <mesh key={d.id} position={d.pos} renderOrder={2}>
          <sphereGeometry args={[d.r, 28, 28]} />
          <meshStandardMaterial
            color={d.color}
            emissive={d.color}
            emissiveIntensity={0.55}
            roughness={0.22}
            metalness={0.02}
            toneMapped={false}
          />
        </mesh>
      ))}

      <group position={[0, -1.3, 0.25]}>
        <mesh>
          <boxGeometry args={[1.5, 0.022, 0.022]} />
          <meshStandardMaterial color={COLORS.scale} />
        </mesh>
        {[
          { x: -0.58, s: [0.1, 0.045, 0.045] as const, c: COLORS.itc },
          { x: -0.12, s: [0.28, 0.075, 0.075] as const, c: COLORS.micro },
          { x: 0.48, s: [0.52, 0.13, 0.13] as const, c: COLORS.macro },
        ].map((m, i) => (
          <mesh key={i} position={[m.x, 0.08, 0]} renderOrder={2}>
            <boxGeometry args={m.s} />
            <meshStandardMaterial
              color={m.c}
              emissive={m.c}
              emissiveIntensity={0.4}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/**
 * Step 4 — schematic SLNB vs ALND panels.
 * Node positions follow the same Level I→III direction (lateral axilla → infraclavicular)
 * as the BodyParts3D-anchored chain in steps 1–2.
 */
export function SurgeryScene({ quality, reducedMotion }: SceneProps) {
  const segs = quality === 'high' ? 20 : 12
  const group = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (reducedMotion || !group.current) return
    group.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.35) * 0.08
  })

  // Relative Level I → III layout (mirrors anatomical direction used in the GLB scene)
  const left = [
    [-0.15, 0.05, 0.12], // Level I / sentinel
    [-0.02, 0.28, 0.0], // Level II hint
  ] as const
  const right = [
    [-0.18, -0.05, 0.14], // Level I
    [-0.08, 0.15, 0.06], // Level II
    [0.05, 0.38, -0.04], // Level III
    [-0.22, 0.22, 0.1],
    [0.12, 0.28, 0.08],
  ] as const

  return (
    <group ref={group}>
      <SoftLight />
      <group position={[-1.45, 0, 0]}>
        <mesh position={[0, 0.1, -0.35]}>
          <boxGeometry args={[1.5, 2.2, 0.08]} />
          <meshStandardMaterial color={COLORS.board} roughness={0.9} />
        </mesh>
        {/* mini chest silhouette */}
        <mesh position={[0, -0.15, 0.05]} scale={[0.9, 1.1, 0.55]}>
          <sphereGeometry args={[0.42, segs, segs]} />
          <meshStandardMaterial color={COLORS.skinDeep} transparent opacity={0.85} />
        </mesh>
        <mesh position={[-0.35, 0.15, 0.05]} rotation={[0.1, 0.2, -0.9]}>
          <capsuleGeometry args={[0.1, 0.35, 4, segs]} />
          <meshStandardMaterial color={COLORS.skin} transparent opacity={0.8} />
        </mesh>
        {left.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.09, segs, segs]} />
            <meshStandardMaterial
              color={i === 0 ? COLORS.sentinel : COLORS.node}
              emissive={i === 0 ? COLORS.sentinel : '#000'}
              emissiveIntensity={i === 0 ? 0.22 : 0}
            />
          </mesh>
        ))}
      </group>
      <group position={[1.45, 0, 0]}>
        <mesh position={[0, 0.1, -0.35]}>
          <boxGeometry args={[1.5, 2.2, 0.08]} />
          <meshStandardMaterial color={COLORS.board} roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.15, 0.05]} scale={[0.9, 1.1, 0.55]}>
          <sphereGeometry args={[0.42, segs, segs]} />
          <meshStandardMaterial color={COLORS.skinDeep} transparent opacity={0.85} />
        </mesh>
        <mesh position={[-0.35, 0.15, 0.05]} rotation={[0.1, 0.2, -0.9]}>
          <capsuleGeometry args={[0.1, 0.35, 4, segs]} />
          <meshStandardMaterial color={COLORS.skin} transparent opacity={0.8} />
        </mesh>
        {right.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.085, segs, segs]} />
            <meshStandardMaterial
              color={i < 3 ? COLORS.sentinel : COLORS.node}
              emissive={i < 3 ? COLORS.sentinel : '#000'}
              emissiveIntensity={i < 3 ? 0.12 : 0}
            />
          </mesh>
        ))}
      </group>
    </group>
  )
}

/** Step 5 */
export function PatchesScene({ quality, reducedMotion }: SceneProps) {
  const cols = quality === 'high' ? 8 : 5
  const rows = quality === 'high' ? 6 : 4
  const hot = { c: 3, r: 2 }
  const group = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (reducedMotion || !group.current) return
    group.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.28) * 0.1
    group.current.rotation.x = Math.sin(clock.getElapsedTime() * 0.18) * 0.04
  })

  const tiles = useMemo(() => {
    const list: { x: number; y: number; hot: boolean; shade: string }[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const n = (r * cols + c) % 3
        list.push({
          x: (c - (cols - 1) / 2) * 0.3,
          y: ((rows - 1) / 2 - r) * 0.3,
          hot: c === hot.c && r === hot.r,
          shade: n === 0 ? '#9eb5ab' : n === 1 ? '#b7c9bf' : '#8fa89d',
        })
      }
    }
    return list
  }, [cols, rows])

  return (
    <group ref={group}>
      <SoftLight />
      <mesh position={[0, 0, -0.1]}>
        <planeGeometry args={[cols * 0.3 + 0.35, rows * 0.3 + 0.35]} />
        <meshStandardMaterial color={COLORS.slide} roughness={0.95} />
      </mesh>
      {tiles.map((t, i) => (
        <mesh key={i} position={[t.x, t.y, t.hot ? 0.08 : 0.02]}>
          <planeGeometry args={[0.26, 0.26]} />
          <meshStandardMaterial
            color={t.hot ? COLORS.patchHot : t.shade}
            emissive={t.hot ? COLORS.patchHot : '#000'}
            emissiveIntensity={t.hot ? 0.3 : 0}
            roughness={0.7}
          />
        </mesh>
      ))}
    </group>
  )
}

export function SceneForStep(props: SceneProps & { stepId: ExplainerStepId }) {
  switch (props.stepId) {
    case 'lymphatic':
      return <LymphaticScene {...props} />
    case 'spread':
      return <SpreadScene {...props} />
    case 'inside':
      return <InsideNodeScene {...props} />
    case 'surgery':
      return <SurgeryScene {...props} />
    case 'patches':
      return <PatchesScene {...props} />
    default:
      return null
  }
}

export type CameraTarget = {
  position: [number, number, number]
  lookAt: [number, number, number]
}

export function cameraTargetFor(stepId: ExplainerStepId, mobile = false): CameraTarget {
  // Patient-right axilla sits at roughly landmark('axilla') ≈ (−0.75, −0.15, 0)
  if (mobile) {
    switch (stepId) {
      case 'lymphatic':
        return { position: [-2.2, 0.95, 2.2], lookAt: [-0.55, 0.15, 0.0] }
      case 'spread':
        return { position: [-2.15, 0.9, 2.15], lookAt: [-0.55, 0.15, 0.0] }
      case 'inside':
        return { position: [0.1, 0.22, 3.55], lookAt: [0, -0.05, 0] }
      case 'surgery':
        return { position: [0, 0.35, 4.8], lookAt: [0, 0.05, 0] }
      case 'patches':
        return { position: [0.06, 0.2, 3.75], lookAt: [0, 0, 0] }
      default:
        return { position: [-1.5, 0.5, 2.7], lookAt: [-0.5, 0, 0] }
    }
  }
  switch (stepId) {
    case 'lymphatic':
      return { position: [-2.35, 0.95, 2.9], lookAt: [-0.5, 0.12, 0.02] }
    case 'spread':
      return { position: [-2.25, 0.9, 2.85], lookAt: [-0.5, 0.12, 0.02] }
    case 'inside':
      return { position: [0.15, 0.25, 3.8], lookAt: [0, -0.05, 0] }
    case 'surgery':
      return { position: [0, 0.48, 5.1], lookAt: [0, 0.08, 0] }
    case 'patches':
      return { position: [0.1, 0.28, 4.1], lookAt: [0, 0, 0] }
    default:
      return { position: [-2.0, 0.6, 3.1], lookAt: [-0.4, 0, 0] }
  }
}
