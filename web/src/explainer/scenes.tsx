import { useMemo, useRef, useEffect, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import * as THREE from 'three'
import type { ExplainerStepId } from './steps'
import { COLORS } from './colors'
import { AnatomyTorso, landmark } from './AnatomyTorso'
import { cameraTargetFor, type CameraTarget } from './cameraFit'

export type SceneQuality = 'high' | 'low'
export type { CameraTarget }
export { cameraTargetFor }

type SceneProps = {
  quality: SceneQuality
  reducedMotion: boolean
  activeNode: string | null
  onActiveNode: (id: string | null) => void
}

export function SoftLight() {
  return (
    <>
      <ambientLight intensity={0.58} />
      <hemisphereLight args={['#f7f2e8', '#9aabb0', 0.55]} />
      <directionalLight position={[3.5, 5.5, 4]} intensity={1.1} color="#fff4e6" />
      <directionalLight position={[-2.8, 2.0, -1.8]} intensity={0.35} color="#b7c9c0" />
      <pointLight position={[0.6, 0.9, 1.8]} intensity={0.28} color="#ffe8d6" />
    </>
  )
}

/**
 * Gentle idle sway — model stays upright (three-quarter angle comes from the camera).
 */
function IdleSway({
  reducedMotion,
  children,
}: {
  reducedMotion: boolean
  children: ReactNode
}) {
  const ref = useRef<Group>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.rotation.set(0, 0, 0)
    }
  }, [])
  useFrame(() => {
    if (reducedMotion || !ref.current) return
    ref.current.rotation.y = Math.sin(performance.now() * 0.00022) * 0.04
  })
  return <group ref={ref}>{children}</group>
}

/**
 * Axillary drainage path: tumor (UOQ, anterior to pec) → Level I hollow →
 * Level II (behind pec minor) → Level III (infraclavicular).
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
  { id: 'sentinel', pos: landmark('sentinel'), r: 0.095, level: 1 },
  { id: 'level2', pos: landmark('level2'), r: 0.078, level: 2 },
  { id: 'level3', pos: landmark('level3'), r: 0.07, level: 3 },
] as const

const LEVEL1_SATELLITES: [number, number, number][] = [
  [
    landmark('sentinel')[0] + 0.05,
    landmark('sentinel')[1] + 0.07,
    landmark('sentinel')[2] - 0.015,
  ],
  [
    landmark('sentinel')[0] + 0.015,
    landmark('sentinel')[1] + 0.12,
    landmark('sentinel')[2] + 0.03,
  ],
]

function OverlayMaterial({
  color,
  emissive,
  emissiveIntensity = 0,
  roughness = 0.36,
  transparent = false,
  opacity = 1,
}: {
  color: string
  emissive?: string
  emissiveIntensity?: number
  roughness?: number
  transparent?: boolean
  opacity?: number
}) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={emissive ?? '#000'}
      emissiveIntensity={emissiveIntensity}
      roughness={roughness}
      transparent={transparent || opacity < 1}
      opacity={opacity}
      depthTest={false}
      depthWrite={false}
      toneMapped={emissiveIntensity > 0 ? false : true}
    />
  )
}

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
    <mesh geometry={geom} renderOrder={11}>
      <OverlayMaterial color={color} opacity={opacity} transparent={opacity < 1} roughness={0.45} />
    </mesh>
  )
}

function AxillaryChain({
  quality,
  activeNode,
  onActiveNode,
  interactive,
  showPath = true,
}: {
  quality: SceneQuality
  activeNode: string | null
  onActiveNode: (id: string | null) => void
  interactive: boolean
  showPath?: boolean
}) {
  const segs = quality === 'high' ? 28 : 14
  const path = useMemo(() => axillaryPath(), [])
  const tubular = quality === 'high' ? 64 : 28

  return (
    <group>
      {showPath && (
        <LymphTube curve={path} radius={0.028} tubular={tubular} color={COLORS.vessel} />
      )}
      {AXILLA_NODES.map((n) => {
        const hot = interactive && activeNode === n.id
        const isSentinel = n.id === 'sentinel'
        return (
          <mesh
            key={n.id}
            position={n.pos}
            scale={hot ? 1.22 : 1}
            renderOrder={12}
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
            <OverlayMaterial
              color={hot ? COLORS.nodeHot : isSentinel ? COLORS.sentinel : COLORS.node}
              emissive={isSentinel || hot ? COLORS.sentinel : '#000'}
              emissiveIntensity={hot ? 0.4 : isSentinel ? 0.22 : 0}
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
    <IdleSway reducedMotion={reducedMotion}>
      <SoftLight />
      <AnatomyTorso quality={quality} />
      <AxillaryChain
        quality={quality}
        activeNode={activeNode}
        onActiveNode={onActiveNode}
        interactive
      />
    </IdleSway>
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
        showPath={false}
      />
      <LymphTube
        curve={path}
        radius={0.034}
        tubular={quality === 'high' ? 72 : 32}
        color={COLORS.vessel}
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
            renderOrder={14}
          >
            <sphereGeometry args={[0.05, 12, 12]} />
            <OverlayMaterial
              color={COLORS.tumorCell}
              emissive={COLORS.tumor}
              emissiveIntensity={0.7}
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

function SurgeryPanelNodes({
  mode,
  quality,
}: {
  mode: 'slnb' | 'alnd'
  quality: SceneQuality
}) {
  const segs = quality === 'high' ? 22 : 12
  if (mode === 'slnb') {
    const nodes = [landmark('sentinel'), ...LEVEL1_SATELLITES.slice(0, 2)]
    return (
      <group>
        {nodes.map((p, i) => (
          <mesh key={i} position={p} renderOrder={12}>
            <sphereGeometry args={[i === 0 ? 0.1 : 0.078, segs, segs]} />
            <OverlayMaterial
              color={COLORS.sentinel}
              emissive={COLORS.sentinel}
              emissiveIntensity={i === 0 ? 0.4 : 0.22}
            />
          </mesh>
        ))}
      </group>
    )
  }
  return (
    <group>
      <mesh position={landmark('sentinel')} renderOrder={12}>
        <sphereGeometry args={[0.1, segs, segs]} />
        <OverlayMaterial color={COLORS.sentinel} emissive={COLORS.sentinel} emissiveIntensity={0.32} />
      </mesh>
      {LEVEL1_SATELLITES.map((p, i) => (
        <mesh key={`l1-${i}`} position={p} renderOrder={12}>
          <sphereGeometry args={[0.08, segs, segs]} />
          <OverlayMaterial color={COLORS.sentinel} emissive={COLORS.sentinel} emissiveIntensity={0.22} />
        </mesh>
      ))}
      <mesh position={landmark('level2')} renderOrder={12}>
        <sphereGeometry args={[0.09, segs, segs]} />
        <OverlayMaterial color={COLORS.nodeHot} emissive={COLORS.nodeHot} emissiveIntensity={0.3} />
      </mesh>
      <mesh position={landmark('level3')} renderOrder={12} scale={0.85}>
        <sphereGeometry args={[0.07, segs, segs]} />
        <OverlayMaterial color={COLORS.node} opacity={0.4} transparent />
      </mesh>
    </group>
  )
}

/**
 * Step 4 — SLNB vs ALND side-by-side BodyParts3D torsos.
 * Each panel is large and upright; shared camera uses surgeryFocusBox three-quarter fit.
 */
export function SurgeryScene({ quality, reducedMotion }: SceneProps) {
  const group = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (reducedMotion || !group.current) return
    group.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.22) * 0.03
  })

  // Fill each half of the canvas; slight Y yaw so axilla reads in the shared three-quarter camera
  const panelScale = 0.95
  const panelX = 1.55
  const yaw = -0.2

  return (
    <group ref={group}>
      <SoftLight />
      <group position={[-panelX, 0, 0]} scale={panelScale} rotation={[0.02, yaw, 0]}>
        <AnatomyTorso quality={quality} showInternals={false} showTumor={false} />
        <SurgeryPanelNodes mode="slnb" quality={quality} />
      </group>
      <group position={[panelX, 0, 0]} scale={panelScale} rotation={[0.02, yaw, 0]}>
        <AnatomyTorso quality={quality} showInternals={false} showTumor={false} />
        <SurgeryPanelNodes mode="alnd" quality={quality} />
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
