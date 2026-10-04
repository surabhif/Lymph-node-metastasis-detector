import { useMemo, useRef, useEffect, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import * as THREE from 'three'
import { Html, useTexture } from '@react-three/drei'
import type { ExplainerStepId } from './steps'
import { COLORS } from './colors'
import { AnatomyTorso, landmark } from './AnatomyTorso'
import {
  cameraTargetFor,
  SURGERY_PANEL_SCALE,
  SURGERY_PANEL_X,
  type CameraTarget,
} from './cameraFit'
import patchesMeta from './patchesMeta.json'

export type SceneQuality = 'high' | 'low'
export type { CameraTarget }
export { cameraTargetFor }

type SceneProps = {
  quality: SceneQuality
  reducedMotion: boolean
  activeNode: string | null
  onActiveNode: (id: string | null) => void
  /** Surgery step: which panel(s) to show. Desktop uses 'both'. */
  surgeryMode?: 'slnb' | 'alnd' | 'both'
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
    landmark('sentinel')[0] + 0.08,
    landmark('sentinel')[1] + 0.09,
    landmark('sentinel')[2] - 0.02,
  ],
  [
    landmark('sentinel')[0] + 0.03,
    landmark('sentinel')[1] + 0.15,
    landmark('sentinel')[2] + 0.04,
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
    // 1–3 clearly lit Level I nodes for sentinel biopsy
    const nodes = [landmark('sentinel'), ...LEVEL1_SATELLITES.slice(0, 2)]
    return (
      <group>
        {nodes.map((p, i) => (
          <mesh key={i} position={p} renderOrder={12}>
            <sphereGeometry args={[i === 0 ? 0.13 : 0.1, segs, segs]} />
            <OverlayMaterial
              color={COLORS.sentinel}
              emissive={COLORS.sentinel}
              emissiveIntensity={i === 0 ? 0.55 : 0.38}
            />
          </mesh>
        ))}
      </group>
    )
  }
  // Levels I–II highlighted; Level III stays faint for contrast
  return (
    <group>
      <mesh position={landmark('sentinel')} renderOrder={12}>
        <sphereGeometry args={[0.12, segs, segs]} />
        <OverlayMaterial color={COLORS.nodeHot} emissive={COLORS.nodeHot} emissiveIntensity={0.45} />
      </mesh>
      {LEVEL1_SATELLITES.map((p, i) => (
        <mesh key={`l1-${i}`} position={p} renderOrder={12}>
          <sphereGeometry args={[0.1, segs, segs]} />
          <OverlayMaterial color={COLORS.nodeHot} emissive={COLORS.nodeHot} emissiveIntensity={0.35} />
        </mesh>
      ))}
      <mesh position={landmark('level2')} renderOrder={12}>
        <sphereGeometry args={[0.115, segs, segs]} />
        <OverlayMaterial color={COLORS.nodeHot} emissive={COLORS.nodeHot} emissiveIntensity={0.42} />
      </mesh>
      <mesh position={landmark('level3')} renderOrder={12} scale={0.8}>
        <sphereGeometry args={[0.075, segs, segs]} />
        <OverlayMaterial color={COLORS.node} opacity={0.28} transparent />
      </mesh>
    </group>
  )
}

/**
 * Step 4 — SLNB vs ALND BodyParts3D torsos.
 * Desktop: two scaled panels side-by-side with a gap (camera pulls back to fit both).
 * Mobile: one panel at a time (same framing as step 1), toggled via surgeryMode.
 */
export function SurgeryScene({ quality, reducedMotion, surgeryMode = 'both' }: SceneProps) {
  const group = useRef<Group>(null)
  useFrame(({ clock }) => {
    if (reducedMotion || !group.current) return
    group.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.22) * 0.025
  })

  const single = surgeryMode !== 'both'
  // Match step-1 three-quarter feel via local yaw; dual layout synced with cameraFit
  const panelScale = single ? 1 : SURGERY_PANEL_SCALE
  const panelX = single ? 0 : SURGERY_PANEL_X
  const yaw = -0.38 // ~22° — gentle three-quarter, flatter for dual-panel read

  const showSlnb = surgeryMode === 'slnb' || surgeryMode === 'both'
  const showAlnd = surgeryMode === 'alnd' || surgeryMode === 'both'

  return (
    <group ref={group}>
      <SoftLight />
      {showSlnb && (
        <group position={[-panelX, 0, 0]} scale={panelScale} rotation={[0.04, yaw, 0]}>
          <AnatomyTorso quality={quality} showInternals={false} showTumor={false} />
          <SurgeryPanelNodes mode="slnb" quality={quality} />
        </group>
      )}
      {showAlnd && (
        <group position={[panelX, 0, 0]} scale={panelScale} rotation={[0.04, yaw, 0]}>
          <AnatomyTorso quality={quality} showInternals={false} showTumor={false} />
          <SurgeryPanelNodes mode="alnd" quality={quality} />
        </group>
      )}
    </group>
  )
}

/**
 * Step 5 — real H&E PCam mosaic standing in for a whole-slide image.
 * Grid aligns to 96×96 tiles; a known tumor patch lifts/zooms with its ground truth.
 */
export function PatchesScene({ quality, reducedMotion }: SceneProps) {
  const grid = patchesMeta.grid
  const tileSize = quality === 'high' ? 1.05 : 0.95
  const mosaicSize = tileSize * grid
  const half = mosaicSize / 2

  const mosaicUrl = `${import.meta.env.BASE_URL}${patchesMeta.mosaicSrc}`
  const hotUrl = `${import.meta.env.BASE_URL}${patchesMeta.hotTile.src}`
  const [mosaicTex, hotTex] = useTexture([mosaicUrl, hotUrl]) as [
    THREE.Texture,
    THREE.Texture,
  ]

  useEffect(() => {
    for (const t of [mosaicTex, hotTex]) {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      t.needsUpdate = true
    }
  }, [mosaicTex, hotTex])

  const hotRow = patchesMeta.hotTile.row
  const hotCol = patchesMeta.hotTile.col
  const hotLocalX = -half + tileSize * (hotCol + 0.5)
  const hotLocalY = half - tileSize * (hotRow + 0.5)

  const mosaicGroup = useRef<Group>(null)
  const hotGroup = useRef<Group>(null)
  const zoomed = useRef(0) // 0 = mosaic, 1 = zoomed patch

  useFrame(({ clock }) => {
    if (!hotGroup.current || !mosaicGroup.current) return
    if (reducedMotion) {
      zoomed.current = 0
      hotGroup.current.position.set(hotLocalX, hotLocalY, 0.12)
      hotGroup.current.scale.setScalar(1.06)
      mosaicGroup.current.position.z = 0
      return
    }
    // Cycle: hold mosaic → lift/zoom → hold patch → ease back
    const cycle = 7.5
    const t = clock.getElapsedTime() % cycle
    let z = 0
    if (t < 2.2) z = 0
    else if (t < 3.4) z = (t - 2.2) / 1.2
    else if (t < 5.6) z = 1
    else z = 1 - (t - 5.6) / 1.9
    z = THREE.MathUtils.smoothstep(z, 0, 1)
    zoomed.current = z

    const x = THREE.MathUtils.lerp(hotLocalX, 0, z)
    const y = THREE.MathUtils.lerp(hotLocalY, 0.05, z)
    const elev = THREE.MathUtils.lerp(0.08, 0.72, z)
    const s = THREE.MathUtils.lerp(1.04, 2.75, z)
    hotGroup.current.position.set(x, y, elev)
    hotGroup.current.scale.setScalar(s)
    mosaicGroup.current.position.z = THREE.MathUtils.lerp(0, -0.15, z)
    // Fade mosaic slightly when zoomed so the patch reads clearly
    mosaicGroup.current.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      const mat = mesh.material as THREE.MeshBasicMaterial
      if (mat && 'opacity' in mat && mesh.userData.fadable) {
        mat.opacity = THREE.MathUtils.lerp(1, 0.35, z)
      }
    })
  })

  const tumorTiles = patchesMeta.tiles.filter((t) => t.isTumor && !t.hot)
  const gap = 0.018

  return (
    <group>
      <ambientLight intensity={0.95} />
      <directionalLight position={[2, 3, 4]} intensity={0.55} color="#fff8f0" />

      <group ref={mosaicGroup}>
        {/* Real H&E mosaic */}
        <mesh position={[0, 0, 0]} userData={{ fadable: true }}>
          <planeGeometry args={[mosaicSize, mosaicSize]} />
          <meshBasicMaterial map={mosaicTex} toneMapped={false} transparent />
        </mesh>

        {/* Tumor-label cue: thin border only (keeps H&E fully readable) */}
        {tumorTiles.map((t) => {
          const x = -half + tileSize * (t.col + 0.5)
          const y = half - tileSize * (t.row + 0.5)
          const inner = tileSize - gap
          const stroke = 0.035
          return (
            <group key={`tint-${t.row}-${t.col}`} position={[x, y, 0.025]}>
              <mesh position={[0, inner / 2 - stroke / 2, 0]} userData={{ fadable: true }}>
                <planeGeometry args={[inner, stroke]} />
                <meshBasicMaterial color={COLORS.tumor} toneMapped={false} />
              </mesh>
              <mesh position={[0, -inner / 2 + stroke / 2, 0]} userData={{ fadable: true }}>
                <planeGeometry args={[inner, stroke]} />
                <meshBasicMaterial color={COLORS.tumor} toneMapped={false} />
              </mesh>
              <mesh position={[-inner / 2 + stroke / 2, 0, 0]} userData={{ fadable: true }}>
                <planeGeometry args={[stroke, inner - stroke * 2]} />
                <meshBasicMaterial color={COLORS.tumor} toneMapped={false} />
              </mesh>
              <mesh position={[inner / 2 - stroke / 2, 0, 0]} userData={{ fadable: true }}>
                <planeGeometry args={[stroke, inner - stroke * 2]} />
                <meshBasicMaterial color={COLORS.tumor} toneMapped={false} />
              </mesh>
            </group>
          )
        })}

        {/* Grid lines aligned to 96×96 tile boundaries */}
        {Array.from({ length: grid + 1 }).map((_, i) => {
          const o = -half + i * tileSize
          return (
            <group key={`grid-${i}`}>
              <mesh position={[o, 0, 0.03]} userData={{ fadable: true }}>
                <planeGeometry args={[0.012, mosaicSize + 0.02]} />
                <meshBasicMaterial color="#fffcf6" transparent opacity={0.85} depthWrite={false} />
              </mesh>
              <mesh position={[0, o, 0.03]} userData={{ fadable: true }}>
                <planeGeometry args={[mosaicSize + 0.02, 0.012]} />
                <meshBasicMaterial color="#fffcf6" transparent opacity={0.85} depthWrite={false} />
              </mesh>
            </group>
          )
        })}
      </group>

      {/* Highlighted tumor patch — lifts and zooms */}
      <group ref={hotGroup} position={[hotLocalX, hotLocalY, 0.1]}>
        <mesh>
          <planeGeometry args={[tileSize - gap * 0.5, tileSize - gap * 0.5]} />
          <meshBasicMaterial map={hotTex} toneMapped={false} />
        </mesh>
        {/* Center 32×32 labeling cue */}
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[(tileSize - gap) * (32 / 96), (tileSize - gap) * (32 / 96)]} />
          <meshBasicMaterial
            color={COLORS.tumor}
            transparent
            opacity={0.2}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {(() => {
          const inner = (tileSize - gap) * (32 / 96)
          const stroke = 0.02
          return (
            <group position={[0, 0, 0.012]}>
              <mesh position={[0, inner / 2, 0]}>
                <planeGeometry args={[inner + stroke, stroke]} />
                <meshBasicMaterial color="#fffcf6" toneMapped={false} />
              </mesh>
              <mesh position={[0, -inner / 2, 0]}>
                <planeGeometry args={[inner + stroke, stroke]} />
                <meshBasicMaterial color="#fffcf6" toneMapped={false} />
              </mesh>
              <mesh position={[-inner / 2, 0, 0]}>
                <planeGeometry args={[stroke, inner]} />
                <meshBasicMaterial color="#fffcf6" toneMapped={false} />
              </mesh>
              <mesh position={[inner / 2, 0, 0]}>
                <planeGeometry args={[stroke, inner]} />
                <meshBasicMaterial color="#fffcf6" toneMapped={false} />
              </mesh>
            </group>
          )
        })()}
        <mesh position={[0, 0, -0.005]}>
          <planeGeometry args={[tileSize + 0.04, tileSize + 0.04]} />
          <meshBasicMaterial color={COLORS.tumor} toneMapped={false} />
        </mesh>
        <Html
          center
          position={[0, -tileSize * 0.62, 0.05]}
          style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
          zIndexRange={[20, 0]}
        >
          <div className="patch-float-label">
            <strong>96×96 patch</strong>
            <span>Ground truth: tumor</span>
            <em>Center 32×32 decides the label</em>
          </div>
        </Html>
      </group>
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
