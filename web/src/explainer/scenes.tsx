import { useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import * as THREE from 'three'
import type { ExplainerStepId } from './steps'

export type SceneQuality = 'high' | 'low'

type SceneProps = {
  quality: SceneQuality
  reducedMotion: boolean
  activeNode: string | null
  onActiveNode: (id: string | null) => void
}

const PALETTE = {
  skin: '#c9b7a1',
  skinDeep: '#b39a82',
  vessel: '#2f8f78',
  node: '#0b6b54',
  nodeSoft: '#5a9a88',
  nodeHot: '#0e8a6c',
  tumor: '#9f2d22',
  deposit: '#c45c4a',
  lymphoid: '#d5e6de',
  slide: '#e6ddcf',
  patch: '#a9bfb5',
  patchHot: '#0b6b54',
  board: '#f4efe6',
}

export function SoftLight() {
  return (
    <>
      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#f7f2e8', '#8aa89a', 0.55]} />
      <directionalLight position={[4.5, 7, 3]} intensity={1.15} color="#fff4e6" castShadow={false} />
      <directionalLight position={[-4, 2.5, -3]} intensity={0.35} color="#a8c9bc" />
      <pointLight position={[1.2, 1.6, 2]} intensity={0.35} color="#dff3eb" />
    </>
  )
}

function IdleSpin({
  reducedMotion,
  speed = 0.12,
  children,
}: {
  reducedMotion: boolean
  speed?: number
  children: ReactNode
}) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    if (reducedMotion || !ref.current) return
    ref.current.rotation.y += dt * speed
  })
  return <group ref={ref}>{children}</group>
}

/** Shared breast + torso silhouette used by anatomy scenes */
function TorsoFigure({ quality, showTumor = true }: { quality: SceneQuality; showTumor?: boolean }) {
  const segs = quality === 'high' ? 32 : 16
  return (
    <group>
      {/* shoulders / upper torso */}
      <mesh position={[0, 0.15, 0]} rotation={[0.08, 0.4, 0]} castShadow>
        <capsuleGeometry args={[0.72, 1.35, 8, segs]} />
        <meshStandardMaterial color={PALETTE.skin} roughness={0.78} metalness={0.04} />
      </mesh>
      {/* neck hint */}
      <mesh position={[-0.05, 1.15, -0.05]}>
        <cylinderGeometry args={[0.22, 0.26, 0.35, segs]} />
        <meshStandardMaterial color={PALETTE.skinDeep} roughness={0.8} />
      </mesh>
      {/* breast mound */}
      <mesh position={[0.32, 0.05, 0.62]}>
        <sphereGeometry args={[0.38, segs, segs]} />
        <meshStandardMaterial color={PALETTE.skinDeep} roughness={0.72} />
      </mesh>
      {showTumor && (
        <mesh position={[0.42, 0.08, 0.88]}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshStandardMaterial
            color={PALETTE.tumor}
            emissive={PALETTE.tumor}
            emissiveIntensity={0.28}
            roughness={0.45}
          />
        </mesh>
      )}
    </group>
  )
}

function vesselCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.42, 0.08, 0.88),
    new THREE.Vector3(0.7, 0.22, 0.78),
    new THREE.Vector3(1.05, 0.42, 0.55),
    new THREE.Vector3(1.28, 0.58, 0.28),
    new THREE.Vector3(1.42, 0.9, 0.05),
    new THREE.Vector3(1.28, 1.2, -0.12),
  ])
}

/** Step 1 */
export function LymphaticScene({ quality, reducedMotion, activeNode, onActiveNode }: SceneProps) {
  const segs = quality === 'high' ? 28 : 14
  const path = useMemo(() => vesselCurve(), [])
  const vesselPoints = useMemo(() => path.getPoints(quality === 'high' ? 64 : 28), [path, quality])
  const nodes = useMemo(
    () => [
      { id: 'sentinel', pos: [1.28, 0.58, 0.28] as const, r: 0.13 },
      { id: 'level2', pos: [1.42, 0.9, 0.05] as const, r: 0.1 },
      { id: 'level3', pos: [1.28, 1.2, -0.12] as const, r: 0.095 },
    ],
    [],
  )

  return (
    <IdleSpin reducedMotion={reducedMotion} speed={0.08}>
      <SoftLight />
      <TorsoFigure quality={quality} />
      <Line points={vesselPoints} color={PALETTE.vessel} lineWidth={3} transparent opacity={0.95} />
      {/* secondary faint vessels */}
      <Line
        points={[
          new THREE.Vector3(0.35, 0.0, 0.7),
          new THREE.Vector3(0.85, 0.35, 0.45),
          new THREE.Vector3(1.2, 0.75, 0.1),
        ]}
        color={PALETTE.vessel}
        lineWidth={1.5}
        transparent
        opacity={0.45}
      />
      {nodes.map((n) => {
        const hot = activeNode === n.id
        const isSentinel = n.id === 'sentinel'
        return (
          <mesh
            key={n.id}
            position={n.pos}
            scale={hot ? 1.28 : 1}
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              onActiveNode(n.id)
            }}
            onPointerOut={() => onActiveNode(null)}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              onActiveNode(hot ? null : n.id)
            }}
          >
            <sphereGeometry args={[n.r, segs, segs]} />
            <meshStandardMaterial
              color={hot ? PALETTE.nodeHot : isSentinel ? PALETTE.node : PALETTE.nodeSoft}
              emissive={hot || isSentinel ? PALETTE.node : '#000'}
              emissiveIntensity={hot ? 0.28 : isSentinel ? 0.12 : 0}
              roughness={0.4}
            />
          </mesh>
        )
      })}
    </IdleSpin>
  )
}

/** Step 2 */
export function SpreadScene({ quality, reducedMotion }: SceneProps) {
  const segs = quality === 'high' ? 22 : 12
  const path = useMemo(() => vesselCurve(), [])
  const pts = useMemo(() => path.getPoints(quality === 'high' ? 48 : 24), [path, quality])
  const cellCount = quality === 'high' ? 8 : 5
  const cells = useRef<(Mesh | null)[]>([])

  useFrame(({ clock }) => {
    if (reducedMotion) return
    const t = clock.getElapsedTime()
    cells.current.forEach((mesh, i) => {
      if (!mesh) return
      const u = (t * 0.1 + i / cellCount) % 1
      mesh.position.copy(path.getPointAt(u))
      const s = 0.65 + 0.35 * Math.sin(t * 2.2 + i)
      mesh.scale.setScalar(s)
    })
  })

  return (
    <group position={[-0.15, -0.15, 0]}>
      <SoftLight />
      <TorsoFigure quality={quality} />
      <Line points={pts} color={PALETTE.vessel} lineWidth={3.5} />
      <mesh position={[1.28, 0.58, 0.28]}>
        <sphereGeometry args={[0.15, segs, segs]} />
        <meshStandardMaterial color={PALETTE.node} emissive={PALETTE.node} emissiveIntensity={0.18} />
      </mesh>
      <mesh position={[1.28, 1.2, -0.12]}>
        <sphereGeometry args={[0.11, segs, segs]} />
        <meshStandardMaterial color={PALETTE.nodeSoft} />
      </mesh>
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
            <sphereGeometry args={[0.045, 12, 12]} />
            <meshStandardMaterial color={PALETTE.deposit} emissive={PALETTE.tumor} emissiveIntensity={0.35} />
          </mesh>
        )
      })}
    </group>
  )
}

/** Step 3 */
export function InsideNodeScene({ quality, reducedMotion }: SceneProps) {
  const segs = quality === 'high' ? 36 : 18
  const group = useRef<Group>(null)

  useFrame((_, dt) => {
    if (reducedMotion || !group.current) return
    group.current.rotation.y += dt * 0.18
  })

  const deposits = [
    { id: 'itc', pos: [-0.42, 0.28, 0.35] as const, r: 0.06, color: '#e8a598' },
    { id: 'micro', pos: [0.28, -0.12, 0.42] as const, r: 0.14, color: '#d47868' },
    { id: 'macro', pos: [-0.08, 0.22, -0.28] as const, r: 0.3, color: PALETTE.tumor },
  ]

  return (
    <group ref={group} position={[0, 0.05, 0]}>
      <SoftLight />
      {/* translucent outer capsule */}
      <mesh>
        <sphereGeometry args={[1.05, segs, segs, 0, Math.PI * 1.35, 0, Math.PI]} />
        <meshStandardMaterial
          color={PALETTE.node}
          transparent
          opacity={0.22}
          roughness={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.98, segs, segs]} />
        <meshStandardMaterial color={PALETTE.lymphoid} roughness={0.88} transparent opacity={0.92} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <circleGeometry args={[0.98, segs]} />
        <meshStandardMaterial color="#c5ddd2" transparent opacity={0.55} side={THREE.DoubleSide} />
      </mesh>
      {deposits.map((d) => (
        <mesh key={d.id} position={d.pos}>
          <sphereGeometry args={[d.r, 18, 18]} />
          <meshStandardMaterial color={d.color} emissive={d.color} emissiveIntensity={0.16} roughness={0.4} />
        </mesh>
      ))}
    </group>
  )
}

/** Step 4 */
export function SurgeryScene({ quality, reducedMotion }: SceneProps) {
  const segs = quality === 'high' ? 20 : 12
  const group = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (reducedMotion || !group.current) return
    group.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.35) * 0.08
  })

  const left = [
    [0.15, 0.35, 0.2],
    [0.32, 0.62, 0.02],
  ] as const
  const right = [
    [0.12, 0.22, 0.22],
    [0.32, 0.4, 0.08],
    [0.42, 0.65, -0.05],
    [0.22, 0.88, -0.12],
    [0.5, 0.78, 0.12],
  ] as const

  return (
    <group ref={group}>
      <SoftLight />
      <group position={[-1.45, 0, 0]}>
        <mesh position={[0, 0.1, -0.35]}>
          <boxGeometry args={[1.5, 2.2, 0.08]} />
          <meshStandardMaterial color={PALETTE.board} roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.15, 0]}>
          <sphereGeometry args={[0.34, segs, segs]} />
          <meshStandardMaterial color={PALETTE.skinDeep} />
        </mesh>
        {left.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.1, segs, segs]} />
            <meshStandardMaterial
              color={i === 0 ? PALETTE.node : PALETTE.nodeSoft}
              emissive={i === 0 ? PALETTE.node : '#000'}
              emissiveIntensity={i === 0 ? 0.22 : 0}
            />
          </mesh>
        ))}
      </group>
      <group position={[1.45, 0, 0]}>
        <mesh position={[0, 0.1, -0.35]}>
          <boxGeometry args={[1.5, 2.2, 0.08]} />
          <meshStandardMaterial color={PALETTE.board} roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.15, 0]}>
          <sphereGeometry args={[0.34, segs, segs]} />
          <meshStandardMaterial color={PALETTE.skinDeep} />
        </mesh>
        {right.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.09, segs, segs]} />
            <meshStandardMaterial color={PALETTE.node} />
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
        <meshStandardMaterial color={PALETTE.slide} roughness={0.95} />
      </mesh>
      {tiles.map((t, i) => (
        <mesh key={i} position={[t.x, t.y, t.hot ? 0.08 : 0.02]}>
          <planeGeometry args={[0.26, 0.26]} />
          <meshStandardMaterial
            color={t.hot ? PALETTE.patchHot : t.shade}
            emissive={t.hot ? PALETTE.patchHot : '#000'}
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

export function cameraTargetFor(stepId: ExplainerStepId): CameraTarget {
  switch (stepId) {
    case 'lymphatic':
      return { position: [2.9, 1.15, 3.4], lookAt: [0.55, 0.45, 0.2] }
    case 'spread':
      return { position: [2.7, 1.05, 3.35], lookAt: [0.55, 0.45, 0.25] }
    case 'inside':
      return { position: [0.15, 0.35, 3.55], lookAt: [0, 0.05, 0] }
    case 'surgery':
      return { position: [0, 0.55, 4.8], lookAt: [0, 0.15, 0] }
    case 'patches':
      return { position: [0.1, 0.35, 3.9], lookAt: [0, 0, 0] }
    default:
      return { position: [2.5, 1.2, 3.4], lookAt: [0.4, 0.4, 0] }
  }
}
