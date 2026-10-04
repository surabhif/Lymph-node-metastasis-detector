import { useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import * as THREE from 'three'
import type { ExplainerStepId } from './steps'
import { COLORS } from './colors'

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
      <ambientLight intensity={0.52} />
      <hemisphereLight args={['#f7f2e8', '#9aabb0', 0.55]} />
      <directionalLight position={[4.2, 6.5, 3.2]} intensity={1.1} color="#fff4e6" />
      <directionalLight position={[-3.5, 2.2, -2.5]} intensity={0.35} color="#b7c9c0" />
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
  useFrame((_, dt) => {
    if (reducedMotion || !ref.current) return
    ref.current.rotation.y += dt * speed
  })
  return <group ref={ref}>{children}</group>
}

function useTorsoLathe(segs: number, inflate = 0) {
  return useMemo(() => {
    // Upper-torso profile (x = radius, y = height): neck → deltoid shelf → chest → waist.
    const pts = [
      new THREE.Vector2(0.12 + inflate, 1.4),
      new THREE.Vector2(0.16 + inflate, 1.26),
      new THREE.Vector2(0.34 + inflate * 1.1, 1.12),
      new THREE.Vector2(0.52 + inflate * 1.25, 1.0), // shoulder shelf
      new THREE.Vector2(0.58 + inflate * 1.15, 0.82),
      new THREE.Vector2(0.55 + inflate, 0.58),
      new THREE.Vector2(0.52 + inflate, 0.32),
      new THREE.Vector2(0.49 + inflate * 0.85, 0.05),
      new THREE.Vector2(0.47 + inflate * 0.7, -0.28),
      new THREE.Vector2(0.45 + inflate * 0.55, -0.58),
      new THREE.Vector2(0.43 + inflate * 0.45, -0.82),
    ]
    return new THREE.LatheGeometry(pts, segs)
  }, [segs, inflate])
}

/** Lymph drainage: tumor in breast → under skin into axilla → levels I–III toward clavicle. */
function axillaryPath() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.3, 0.2, 0.5), // tumor in breast
    new THREE.Vector3(0.38, 0.24, 0.38),
    new THREE.Vector3(0.46, 0.28, 0.22), // under skin toward axilla
    new THREE.Vector3(0.5, 0.32, 0.04), // enter axillary fold
    new THREE.Vector3(0.5, 0.38, -0.06), // Level I / sentinel (inside axilla)
    new THREE.Vector3(0.44, 0.56, -0.12), // Level II
    new THREE.Vector3(0.32, 0.74, -0.16), // Level III toward clavicle
  ])
}

const AXILLA_NODES = [
  { id: 'sentinel', label: 'Level I · sentinel', pos: [0.5, 0.38, -0.06] as const, r: 0.072 },
  { id: 'level2', label: 'Level II', pos: [0.44, 0.56, -0.12] as const, r: 0.06 },
  { id: 'level3', label: 'Level III', pos: [0.32, 0.74, -0.16] as const, r: 0.054 },
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

/**
 * Stylized upper torso: sculpted chest/shoulders/arm with translucent skin
 * so tumor, vessels, and axillary nodes read as internal anatomy.
 */
function TorsoFigure({
  quality,
  showTumor = true,
  showInternals = true,
}: {
  quality: SceneQuality
  showTumor?: boolean
  showInternals?: boolean
}) {
  const segs = quality === 'high' ? 48 : 24
  const flesh = useTorsoLathe(segs, 0)
  const skin = useTorsoLathe(segs, 0.035)

  return (
    <group>
      {/* deeper soft tissue — translucent so internals read through */}
      <mesh geometry={flesh}>
        <meshStandardMaterial
          color={COLORS.skinDeep}
          roughness={0.9}
          metalness={0.02}
          transparent
          opacity={0.68}
          depthWrite
        />
      </mesh>
      {/* outer skin shell */}
      <mesh geometry={skin}>
        <meshStandardMaterial
          color={COLORS.skinTranslucent}
          roughness={0.48}
          metalness={0.02}
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>

      {/* deltoid / clavicle pads — sculpted shoulder silhouette */}
      <mesh position={[-0.48, 1.0, 0.02]} rotation={[0.12, 0.05, 0.55]} scale={[1.05, 0.5, 0.7]}>
        <sphereGeometry args={[0.3, segs, segs]} />
        <meshStandardMaterial color={COLORS.skin} roughness={0.72} transparent opacity={0.8} />
      </mesh>
      <mesh position={[0.48, 1.0, 0.06]} rotation={[0.12, -0.05, -0.55]} scale={[1.1, 0.52, 0.75]}>
        <sphereGeometry args={[0.32, segs, segs]} />
        <meshStandardMaterial color={COLORS.skin} roughness={0.72} transparent opacity={0.8} />
      </mesh>

      {/* pec / chest plane hint (right) */}
      <mesh position={[0.2, 0.45, 0.3]} rotation={[-0.4, 0.28, 0.06]} scale={[1.15, 0.9, 0.42]}>
        <sphereGeometry args={[0.36, segs, Math.max(12, segs / 2)]} />
        <meshStandardMaterial color={COLORS.skin} roughness={0.7} transparent opacity={0.5} />
      </mesh>

      {/* neck */}
      <mesh position={[0, 1.32, -0.02]}>
        <cylinderGeometry args={[0.13, 0.17, 0.32, segs]} />
        <meshStandardMaterial color={COLORS.skin} roughness={0.78} transparent opacity={0.9} />
      </mesh>

      {/* right arm — abducted slightly to open a clear axillary pocket */}
      <mesh position={[0.7, 0.48, 0.02]} rotation={[0.25, 0.18, -1.15]}>
        <capsuleGeometry args={[0.15, 0.55, 6, segs]} />
        <meshStandardMaterial color={COLORS.skin} roughness={0.76} transparent opacity={0.82} />
      </mesh>
      <mesh position={[0.95, 0.08, 0.08]} rotation={[0.28, 0.08, -0.42]}>
        <capsuleGeometry args={[0.13, 0.36, 6, Math.max(12, segs / 2)]} />
        <meshStandardMaterial color={COLORS.skinDeep} roughness={0.8} transparent opacity={0.8} />
      </mesh>

      {/* soft axillary hollow fill (keeps nodes visually “inside” the fold) */}
      <mesh position={[0.48, 0.48, -0.08]} scale={[0.55, 0.7, 0.45]}>
        <sphereGeometry args={[0.28, Math.max(12, segs / 2), Math.max(12, segs / 2)]} />
        <meshStandardMaterial
          color={COLORS.skinDeep}
          roughness={0.85}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>

      {/* left arm balance */}
      <mesh position={[-0.68, 0.5, 0]} rotation={[0.12, -0.1, 1.1]}>
        <capsuleGeometry args={[0.14, 0.4, 6, Math.max(12, segs / 2)]} />
        <meshStandardMaterial color={COLORS.skin} roughness={0.8} transparent opacity={0.74} />
      </mesh>

      {/* right breast — tumor sits inside this volume */}
      <mesh position={[0.28, 0.18, 0.48]}>
        <sphereGeometry args={[0.255, segs, segs]} />
        <meshStandardMaterial color="#c4a790" roughness={0.68} transparent opacity={0.78} />
      </mesh>
      <mesh position={[0.28, 0.18, 0.48]} scale={1.12}>
        <sphereGeometry args={[0.255, segs, segs]} />
        <meshStandardMaterial
          color={COLORS.skinTranslucent}
          roughness={0.45}
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>

      {showTumor && (
        <mesh position={[0.3, 0.2, 0.5]}>
          <sphereGeometry args={[0.072, 18, 18]} />
          <meshStandardMaterial
            color={COLORS.tumor}
            emissive={COLORS.tumor}
            emissiveIntensity={0.45}
            roughness={0.3}
          />
        </mesh>
      )}

      {showInternals && (
        <>
          {/* faint internal mammary chain (parasternal) */}
          {[0.1, 0.3, 0.5].map((y, i) => (
            <mesh key={i} position={[0.04, y, 0.34]}>
              <sphereGeometry args={[0.03, 10, 10]} />
              <meshStandardMaterial color={COLORS.node} transparent opacity={0.4} roughness={0.5} />
            </mesh>
          ))}
        </>
      )}
    </group>
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
  const branch = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.22, 0.14, 0.44),
        new THREE.Vector3(0.38, 0.26, 0.2),
        new THREE.Vector3(0.48, 0.36, -0.02),
      ]),
    [],
  )

  return (
    <group>
      <LymphTube curve={path} radius={0.028} tubular={tubular} color={COLORS.vessel} />
      <LymphTube curve={branch} radius={0.016} tubular={Math.max(16, tubular / 2)} color={COLORS.vessel} opacity={0.55} />
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
    <IdleSpin reducedMotion={reducedMotion} speed={0.07}>
      <SoftLight />
      <TorsoFigure quality={quality} />
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
      <TorsoFigure quality={quality} />
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

/** Step 3 — cutaway with legend-matched red deposits + scale cue */
export function InsideNodeScene({ quality, reducedMotion }: SceneProps) {
  const segs = quality === 'high' ? 40 : 20
  const group = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (reducedMotion || !group.current) return
    // Gentle sway keeps the cutaway face toward the camera so deposit colors stay readable
    group.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.45) * 0.35
  })

  // Deposits sit forward on the cutaway face so legend reds read clearly
  const deposits = [
    { id: 'itc', pos: [-0.45, 0.35, 0.55] as const, r: 0.06, color: COLORS.itc },
    { id: 'micro', pos: [0.4, -0.05, 0.5] as const, r: 0.16, color: COLORS.micro },
    { id: 'macro', pos: [-0.05, 0.0, 0.35] as const, r: 0.38, color: COLORS.macro },
  ]

  return (
    <group ref={group} position={[0, 0.05, 0]}>
      <ambientLight intensity={0.65} />
      <hemisphereLight args={['#f8f5ef', '#c8cfcb', 0.35]} />
      <directionalLight position={[3.5, 5, 4]} intensity={1.1} color="#fff8f0" />
      <directionalLight position={[-2.5, 1.5, -2]} intensity={0.25} color="#e8ebe8" />
      {/* capsule shell — cutaway opening faces +Z / camera */}
      <mesh rotation={[0, -0.55, 0]}>
        <sphereGeometry args={[1.08, segs, segs, 0, Math.PI * 1.45, 0, Math.PI]} />
        <meshStandardMaterial
          color={COLORS.nodeCapsule}
          transparent
          opacity={0.28}
          roughness={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* healthy lymphoid — same cutaway, pale tissue matching legend */}
      <mesh rotation={[0, -0.55, 0]}>
        <sphereGeometry args={[1.0, segs, segs, 0, Math.PI * 1.45, 0, Math.PI]} />
        <meshStandardMaterial
          color={COLORS.lymphoid}
          roughness={0.92}
          metalness={0}
          transparent
          opacity={0.82}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* cut face toward camera */}
      <mesh rotation={[0, 0.18, Math.PI / 2]} position={[0.05, 0, 0.15]}>
        <circleGeometry args={[1.0, segs]} />
        <meshStandardMaterial color="#f7faf7" transparent opacity={0.65} side={THREE.DoubleSide} />
      </mesh>
      {/* deposits sit on the cutaway face so reds read clearly */}
      {deposits.map((d) => (
        <mesh key={d.id} position={d.pos}>
          <sphereGeometry args={[d.r, 24, 24]} />
          <meshStandardMaterial
            color={d.color}
            emissive={d.color}
            emissiveIntensity={0.55}
            roughness={0.25}
            metalness={0.02}
          />
        </mesh>
      ))}
      {/* visible scale cue — ITC / micro / macro relative sizes on a bar */}
      <group position={[0, -1.28, 0.2]}>
        <mesh>
          <boxGeometry args={[1.5, 0.022, 0.022]} />
          <meshStandardMaterial color={COLORS.scale} />
        </mesh>
        {[
          { x: -0.58, s: [0.1, 0.045, 0.045] as const, c: COLORS.itc },
          { x: -0.12, s: [0.28, 0.075, 0.075] as const, c: COLORS.micro },
          { x: 0.48, s: [0.52, 0.13, 0.13] as const, c: COLORS.macro },
        ].map((m, i) => (
          <mesh key={i} position={[m.x, 0.08, 0]}>
            <boxGeometry args={m.s} />
            <meshStandardMaterial color={m.c} emissive={m.c} emissiveIntensity={0.35} />
          </mesh>
        ))}
      </group>
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
    [0.18, 0.32, 0.15],
    [0.28, 0.55, 0.0],
  ] as const
  const right = [
    [0.15, 0.22, 0.18],
    [0.28, 0.38, 0.06],
    [0.35, 0.58, -0.04],
    [0.22, 0.78, -0.1],
    [0.42, 0.7, 0.08],
  ] as const

  return (
    <group ref={group}>
      <SoftLight />
      <group position={[-1.45, 0, 0]}>
        <mesh position={[0, 0.1, -0.35]}>
          <boxGeometry args={[1.5, 2.2, 0.08]} />
          <meshStandardMaterial color={COLORS.board} roughness={0.9} />
        </mesh>
        <mesh position={[0, -0.1, 0]}>
          <sphereGeometry args={[0.32, segs, segs]} />
          <meshStandardMaterial color={COLORS.skinDeep} />
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
        <mesh position={[0, -0.1, 0]}>
          <sphereGeometry args={[0.32, segs, segs]} />
          <meshStandardMaterial color={COLORS.skinDeep} />
        </mesh>
        {right.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.085, segs, segs]} />
            <meshStandardMaterial color={COLORS.sentinel} />
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
  if (mobile) {
    switch (stepId) {
      case 'lymphatic':
        return { position: [2.2, 0.85, 3.2], lookAt: [0.18, 0.38, 0.02] }
      case 'spread':
        return { position: [2.15, 0.82, 3.15], lookAt: [0.18, 0.38, 0.04] }
      case 'inside':
        return { position: [0.1, 0.22, 3.55], lookAt: [0, -0.05, 0] }
      case 'surgery':
        return { position: [0, 0.35, 4.8], lookAt: [0, 0.05, 0] }
      case 'patches':
        return { position: [0.06, 0.2, 3.75], lookAt: [0, 0, 0] }
      default:
        return { position: [2.1, 0.85, 3.15], lookAt: [0.15, 0.35, 0] }
    }
  }
  switch (stepId) {
    case 'lymphatic':
      return { position: [2.85, 1.05, 3.55], lookAt: [0.15, 0.4, 0] }
    case 'spread':
      return { position: [2.75, 1.0, 3.5], lookAt: [0.15, 0.4, 0.02] }
    case 'inside':
      return { position: [0.15, 0.25, 3.8], lookAt: [0, -0.05, 0] }
    case 'surgery':
      return { position: [0, 0.48, 5.1], lookAt: [0, 0.08, 0] }
    case 'patches':
      return { position: [0.1, 0.28, 4.1], lookAt: [0, 0, 0] }
    default:
      return { position: [2.7, 1.0, 3.45], lookAt: [0.15, 0.35, 0] }
  }
}
