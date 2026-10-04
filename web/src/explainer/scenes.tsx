import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
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
  skin: '#c4b5a0',
  vessel: '#3d8f7a',
  node: '#0b6b54',
  nodeHot: '#0e8a6c',
  tumor: '#9f2d22',
  deposit: '#c45c4a',
  lymphoid: '#d8e8e1',
  slide: '#e8dfd0',
  patch: '#b8c9c0',
  patchHot: '#0b6b54',
  accent: '#084c3c',
}

function SoftLight() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} color="#fff6ea" />
      <directionalLight position={[-3, 2, -4]} intensity={0.35} color="#b7d4cb" />
    </>
  )
}

/** Step 1 — stylized torso / breast / axillary nodes */
export function LymphaticScene({ quality, activeNode, onActiveNode }: SceneProps) {
  const segs = quality === 'high' ? 24 : 12
  const nodes = useMemo(
    () => [
      { id: 'sentinel', label: 'Sentinel axillary node', pos: [1.15, 0.55, 0.55] as const },
      { id: 'level2', label: 'Axillary node (further)', pos: [1.35, 0.95, 0.2] as const },
      { id: 'level3', label: 'Axillary node (further)', pos: [1.05, 1.25, -0.05] as const },
    ],
    [],
  )

  const vesselPoints = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.35, 0.05, 0.55),
      new THREE.Vector3(0.7, 0.25, 0.65),
      new THREE.Vector3(1.0, 0.45, 0.6),
      new THREE.Vector3(1.15, 0.55, 0.55),
      new THREE.Vector3(1.3, 0.85, 0.3),
      new THREE.Vector3(1.15, 1.15, 0.05),
    ])
    return curve.getPoints(quality === 'high' ? 48 : 24)
  }, [quality])

  return (
    <group>
      <SoftLight />
      {/* torso slab */}
      <mesh position={[0, 0.1, 0]} rotation={[0.12, 0.35, 0]}>
        <capsuleGeometry args={[0.85, 1.6, 6, segs]} />
        <meshStandardMaterial color={PALETTE.skin} roughness={0.85} metalness={0.02} />
      </mesh>
      {/* breast mound */}
      <mesh position={[0.25, 0.05, 0.7]}>
        <sphereGeometry args={[0.42, segs, segs]} />
        <meshStandardMaterial color="#b9a48c" roughness={0.8} />
      </mesh>
      {/* tumor seed */}
      <mesh position={[0.35, 0.05, 0.95]}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshStandardMaterial color={PALETTE.tumor} emissive={PALETTE.tumor} emissiveIntensity={0.15} />
      </mesh>
      <Line
        points={vesselPoints}
        color={PALETTE.vessel}
        lineWidth={2}
        transparent
        opacity={0.9}
      />
      {nodes.map((n) => {
        const hot = activeNode === n.id
        return (
          <group key={n.id} position={n.pos}>
            <mesh
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation()
                onActiveNode(n.id)
              }}
              onPointerOut={() => onActiveNode(null)}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation()
                onActiveNode(hot ? null : n.id)
              }}
              scale={hot ? 1.25 : 1}
            >
              <sphereGeometry args={[0.12, segs, segs]} />
              <meshStandardMaterial
                color={hot ? PALETTE.nodeHot : PALETTE.node}
                emissive={hot ? PALETTE.nodeHot : '#000'}
                emissiveIntensity={hot ? 0.2 : 0}
              />
            </mesh>
            {hot && (
              <Html distanceFactor={6} style={{ pointerEvents: 'none' }}>
                <div className="r3f-label">{n.label}</div>
              </Html>
            )}
          </group>
        )
      })}
    </group>
  )
}

/** Step 2 — cells travel toward sentinel then further */
export function SpreadScene({ quality, reducedMotion }: SceneProps) {
  const segs = quality === 'high' ? 16 : 10
  const path = useMemo(() => {
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.2, 0, 0.7),
      new THREE.Vector3(0.55, 0.15, 0.75),
      new THREE.Vector3(0.95, 0.35, 0.55),
      new THREE.Vector3(1.2, 0.5, 0.4),
      new THREE.Vector3(1.35, 0.85, 0.15),
      new THREE.Vector3(1.2, 1.15, -0.05),
    ])
  }, [])
  const pts = useMemo(() => path.getPoints(quality === 'high' ? 40 : 20), [path, quality])
  const cellCount = quality === 'high' ? 7 : 4
  const cells = useRef<(Mesh | null)[]>([])

  useFrame(({ clock }) => {
    if (reducedMotion) return
    const t = clock.getElapsedTime()
    cells.current.forEach((mesh, i) => {
      if (!mesh) return
      const u = (t * 0.12 + i / cellCount) % 1
      const p = path.getPointAt(u)
      mesh.position.copy(p)
      mesh.scale.setScalar(0.7 + 0.3 * Math.sin(t * 2 + i))
    })
  })

  return (
    <group>
      <SoftLight />
      <mesh position={[0.15, -0.05, 0.55]}>
        <sphereGeometry args={[0.38, segs, segs]} />
        <meshStandardMaterial color="#b9a48c" roughness={0.85} />
      </mesh>
      <mesh position={[0.2, 0, 0.7]}>
        <sphereGeometry args={[0.14, segs, segs]} />
        <meshStandardMaterial color={PALETTE.tumor} emissive={PALETTE.tumor} emissiveIntensity={0.25} />
      </mesh>
      <Line points={pts} color={PALETTE.vessel} lineWidth={2.5} />
      {/* sentinel */}
      <mesh position={[1.2, 0.5, 0.4]}>
        <sphereGeometry args={[0.16, segs, segs]} />
        <meshStandardMaterial color={PALETTE.node} />
      </mesh>
      <Html position={[1.2, 0.75, 0.4]} distanceFactor={7} style={{ pointerEvents: 'none' }}>
        <div className="r3f-label">Sentinel node</div>
      </Html>
      {/* further */}
      <mesh position={[1.2, 1.15, -0.05]}>
        <sphereGeometry args={[0.13, segs, segs]} />
        <meshStandardMaterial color={PALETTE.nodeHot} />
      </mesh>
      <Html position={[1.2, 1.38, -0.05]} distanceFactor={7} style={{ pointerEvents: 'none' }}>
        <div className="r3f-label">Further node</div>
      </Html>
      {Array.from({ length: cellCount }).map((_, i) => {
        const u = reducedMotion ? (i + 0.5) / cellCount : 0
        const p = path.getPointAt(u)
        return (
          <mesh
            key={i}
            ref={(el) => {
              cells.current[i] = el
            }}
            position={p}
          >
            <sphereGeometry args={[0.05, 10, 10]} />
            <meshStandardMaterial color={PALETTE.deposit} emissive={PALETTE.tumor} emissiveIntensity={0.3} />
          </mesh>
        )
      })}
    </group>
  )
}

/** Step 3 — cutaway node with deposit sizes */
export function InsideNodeScene({ quality, reducedMotion }: SceneProps) {
  const segs = quality === 'high' ? 28 : 14
  const group = useRef<Group>(null)

  useFrame((_, dt) => {
    if (reducedMotion || !group.current) return
    group.current.rotation.y += dt * 0.15
  })

  const depositList = [
    { label: 'ITC ≤0.2 mm', pos: [-0.38, 0.22, 0.42] as const, r: 0.055, color: '#e8a598' },
    { label: 'Micrometastasis', pos: [0.22, -0.05, 0.48] as const, r: 0.13, color: '#d47868' },
    { label: 'Macrometastasis', pos: [-0.05, 0.35, -0.15] as const, r: 0.28, color: PALETTE.tumor },
  ]

  return (
    <group ref={group}>
      <SoftLight />
      <mesh>
        <sphereGeometry args={[0.9, segs, segs, 0, Math.PI]} />
        <meshStandardMaterial color={PALETTE.node} transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.88, segs, segs]} />
        <meshStandardMaterial color={PALETTE.lymphoid} roughness={0.9} transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <circleGeometry args={[0.88, segs]} />
        <meshStandardMaterial color="#cfe0d8" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {depositList.map((d) => (
        <group key={d.label} position={d.pos}>
          <mesh>
            <sphereGeometry args={[d.r, 14, 14]} />
            <meshStandardMaterial color={d.color} emissive={d.color} emissiveIntensity={0.12} />
          </mesh>
          <Html distanceFactor={5} style={{ pointerEvents: 'none' }}>
            <div className="r3f-label">{d.label}</div>
          </Html>
        </group>
      ))}
      <Html position={[0, -1.15, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="r3f-label muted">Cut-away lymph node (schematic sizes)</div>
      </Html>
    </group>
  )
}

/** Step 4 — SLNB vs ALND + TNM N */
export function SurgeryScene({ quality }: SceneProps) {
  const segs = quality === 'high' ? 16 : 10

  const nodesLeft = [
    [0.2, 0.4, 0.2],
    [0.35, 0.7, 0],
  ] as const
  const nodesRight = [
    [0.15, 0.25, 0.25],
    [0.35, 0.45, 0.1],
    [0.45, 0.7, -0.05],
    [0.25, 0.95, -0.15],
    [0.55, 0.85, 0.15],
  ] as const

  return (
    <group>
      <SoftLight />
      {/* SLNB panel */}
      <group position={[-1.35, 0, 0]}>
        <mesh position={[0, 0, -0.4]}>
          <boxGeometry args={[1.4, 2.1, 0.08]} />
          <meshStandardMaterial color="#f7f3ea" />
        </mesh>
        <mesh position={[0, -0.2, 0]}>
          <sphereGeometry args={[0.35, segs, segs]} />
          <meshStandardMaterial color="#b9a48c" />
        </mesh>
        {nodesLeft.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.1, segs, segs]} />
            <meshStandardMaterial
              color={i === 0 ? PALETTE.node : '#7a9088'}
              emissive={i === 0 ? PALETTE.node : '#000'}
              emissiveIntensity={i === 0 ? 0.2 : 0}
            />
          </mesh>
        ))}
        <Html position={[0, 1.2, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="r3f-label">Sentinel biopsy</div>
        </Html>
      </group>

      {/* ALND panel */}
      <group position={[1.35, 0, 0]}>
        <mesh position={[0, 0, -0.4]}>
          <boxGeometry args={[1.4, 2.1, 0.08]} />
          <meshStandardMaterial color="#f7f3ea" />
        </mesh>
        <mesh position={[0, -0.2, 0]}>
          <sphereGeometry args={[0.35, segs, segs]} />
          <meshStandardMaterial color="#b9a48c" />
        </mesh>
        {nodesRight.map((p, i) => (
          <mesh key={i} position={p}>
            <sphereGeometry args={[0.09, segs, segs]} />
            <meshStandardMaterial color={PALETTE.node} />
          </mesh>
        ))}
        <Html position={[0, 1.2, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="r3f-label">Axillary dissection</div>
        </Html>
      </group>

      {/* TNM badge */}
      <Html position={[0, -1.35, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="tnm-badge" aria-hidden="true">
          <span>T</span>
          <span className="tnm-n">N</span>
          <span>M</span>
        </div>
      </Html>
    </group>
  )
}

/** Step 5 — WSI tiled into patches */
export function PatchesScene({ quality, reducedMotion }: SceneProps) {
  const cols = quality === 'high' ? 8 : 5
  const rows = quality === 'high' ? 6 : 4
  const hot = { c: 3, r: 2 }
  const group = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (reducedMotion || !group.current) return
    group.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.25) * 0.12
  })

  const tiles = useMemo(() => {
    const list: { x: number; y: number; hot: boolean }[] = []
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        list.push({
          x: (c - (cols - 1) / 2) * 0.28,
          y: ((rows - 1) / 2 - r) * 0.28,
          hot: c === hot.c && r === hot.r,
        })
      }
    }
    return list
  }, [cols, rows])

  return (
    <group ref={group}>
      <SoftLight />
      <mesh position={[0, 0, -0.08]}>
        <planeGeometry args={[cols * 0.28 + 0.2, rows * 0.28 + 0.2]} />
        <meshStandardMaterial color={PALETTE.slide} />
      </mesh>
      {tiles.map((t, i) => (
        <mesh key={i} position={[t.x, t.y, t.hot ? 0.06 : 0.02]}>
          <planeGeometry args={[0.24, 0.24]} />
          <meshStandardMaterial
            color={t.hot ? PALETTE.patchHot : PALETTE.patch}
            emissive={t.hot ? PALETTE.patchHot : '#000'}
            emissiveIntensity={t.hot ? 0.25 : 0}
          />
        </mesh>
      ))}
      <Html position={[0, -1.15, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="r3f-label">Whole-slide → 96×96 PCam-style patches</div>
      </Html>
      <Html position={[tiles.find((t) => t.hot)!.x, tiles.find((t) => t.hot)!.y + 0.28, 0.2]} center style={{ pointerEvents: 'none' }}>
        <div className="r3f-label">One patch → detector + heatmap</div>
      </Html>
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
