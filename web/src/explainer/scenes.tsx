import { useMemo, useRef, useEffect, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import type { Group, Mesh } from 'three'
import * as THREE from 'three'
import { Html, useTexture } from '@react-three/drei'
import type { ExplainerStepId } from './steps'
import { COLORS } from './colors'
import { AnatomyTorso, landmark } from './AnatomyTorso'
import { CinematicLight, MacroNodeLight } from './CinematicLight'
import {
  cameraTargetFor,
  SURGERY_PANEL_SCALE,
  SURGERY_PANEL_X,
  PATCHES_LAYOUT,
  type CameraTarget,
} from './cameraFit'
import patchesMeta from './patchesMeta.json'

export type SceneQuality = 'high' | 'low'
export type DepositMode = 'all' | 'itc' | 'micro' | 'macro'
export type { CameraTarget }
export { cameraTargetFor }

type SceneProps = {
  quality: SceneQuality
  reducedMotion: boolean
  activeNode: string | null
  onActiveNode: (id: string | null) => void
  /** Surgery step: which panel(s) to show. Desktop uses 'both'. */
  surgeryMode?: 'slnb' | 'alnd' | 'both'
  /** Step 3: which deposit size(s) to highlight. */
  depositMode?: DepositMode
}

/** @deprecated Use CinematicLight — kept as a thin alias for any leftover imports. */
export function SoftLight({ quality = 'high' }: { quality?: SceneQuality } = {}) {
  return <CinematicLight quality={quality} />
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
  // Tight cluster in the axilla hollow with the sentinel — medial of the arm, behind glass skin.
  [
    landmark('sentinel')[0] + 0.05,
    landmark('sentinel')[1] + 0.03,
    landmark('sentinel')[2] + 0.03,
  ],
  [
    landmark('sentinel')[0] + 0.03,
    landmark('sentinel')[1] - 0.04,
    landmark('sentinel')[2] + 0.025,
  ],
]

function OverlayMaterial({
  color,
  emissive,
  emissiveIntensity = 0,
  roughness = 0.36,
  transparent = false,
  opacity = 1,
  depthTest = true,
}: {
  color: string
  emissive?: string
  emissiveIntensity?: number
  roughness?: number
  transparent?: boolean
  opacity?: number
  /** Keep true so glass skin can softly occlude vessels/nodes inside the body. */
  depthTest?: boolean
}) {
  return (
    <meshStandardMaterial
      color={color}
      emissive={emissive ?? '#000'}
      emissiveIntensity={emissiveIntensity}
      roughness={roughness}
      transparent={transparent || opacity < 1}
      opacity={opacity}
      depthTest={depthTest}
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
  glow = false,
}: {
  curve: THREE.Curve<THREE.Vector3>
  radius: number
  tubular: number
  color: string
  opacity?: number
  glow?: boolean
}) {
  const geom = useMemo(
    () => new THREE.TubeGeometry(curve, tubular, radius, 8, false),
    [curve, tubular, radius],
  )
  return (
    <mesh geometry={geom} renderOrder={11}>
      <OverlayMaterial
        color={color}
        opacity={opacity}
        transparent={opacity < 1}
        roughness={0.45}
        emissive={glow ? COLORS.vesselGlow : undefined}
        emissiveIntensity={glow ? 0.85 : 0}
      />
    </mesh>
  )
}

/** Moving dashes / particles along the axillary lymph path. */
function LymphFlow({
  curve,
  reducedMotion,
  quality,
  count,
}: {
  curve: THREE.Curve<THREE.Vector3>
  reducedMotion: boolean
  quality: SceneQuality
  count?: number
}) {
  const n = count ?? (quality === 'high' ? 14 : 8)
  const dashes = useRef<(Mesh | null)[]>([])
  const dashGeom = useMemo(() => new THREE.SphereGeometry(0.022, 8, 8), [])

  useFrame(({ clock }) => {
    if (reducedMotion) return
    const t = clock.getElapsedTime()
    dashes.current.forEach((mesh, i) => {
      if (!mesh) return
      const u = (t * 0.12 + i / n) % 1
      mesh.position.copy(curve.getPointAt(u))
      const pulse = 0.75 + 0.35 * Math.sin(t * 3.2 + i)
      mesh.scale.setScalar(pulse)
    })
  })

  return (
    <group>
      {Array.from({ length: n }).map((_, i) => {
        const u = reducedMotion ? (i + 0.5) / n : 0
        return (
          <mesh
            key={i}
            ref={(el) => {
              dashes.current[i] = el
            }}
            geometry={dashGeom}
            position={curve.getPointAt(u)}
            renderOrder={13}
          >
            <meshStandardMaterial
              color={COLORS.vesselGlow}
              emissive={COLORS.vesselGlow}
              emissiveIntensity={1.4}
              toneMapped={false}
              transparent
              opacity={0.9}
              depthWrite={false}
            />
          </mesh>
        )
      })}
    </group>
  )
}

function AxillaryChain({
  quality,
  activeNode,
  onActiveNode,
  interactive,
  showPath = true,
  reducedMotion = false,
  flow = false,
}: {
  quality: SceneQuality
  activeNode: string | null
  onActiveNode: (id: string | null) => void
  interactive: boolean
  showPath?: boolean
  reducedMotion?: boolean
  flow?: boolean
}) {
  const segs = quality === 'high' ? 28 : 14
  const path = useMemo(() => axillaryPath(), [])
  const tubular = quality === 'high' ? 64 : 28

  return (
    <group>
      {showPath && (
        <LymphTube
          curve={path}
          radius={0.022}
          tubular={tubular}
          color={COLORS.vessel}
          glow
          opacity={0.92}
        />
      )}
      {showPath && flow && (
        <LymphFlow curve={path} reducedMotion={reducedMotion} quality={quality} />
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
              emissive={isSentinel || hot ? COLORS.sentinel : COLORS.vesselGlow}
              emissiveIntensity={hot ? 1.1 : isSentinel ? 0.85 : 0.45}
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
      <CinematicLight quality={quality} />
      <AnatomyTorso quality={quality} />
      <AxillaryChain
        quality={quality}
        activeNode={activeNode}
        onActiveNode={onActiveNode}
        interactive
        reducedMotion={reducedMotion}
        flow
      />
    </IdleSway>
  )
}

/** Step 2 */
export function SpreadScene({ quality, reducedMotion }: SceneProps) {
  const path = useMemo(() => axillaryPath(), [])
  const cellCount = quality === 'high' ? 8 : 5
  const cells = useRef<(Mesh | null)[]>([])
  const glowHalos = useRef<(Mesh | null)[]>([])

  useFrame(({ clock }) => {
    if (reducedMotion) return
    const t = clock.getElapsedTime()
    cells.current.forEach((mesh, i) => {
      if (!mesh) return
      const u = (t * 0.09 + i / cellCount) % 1
      mesh.position.copy(path.getPointAt(u))
      mesh.scale.setScalar(0.7 + 0.3 * Math.sin(t * 2.2 + i))
      const halo = glowHalos.current[i]
      if (halo) {
        halo.position.copy(mesh.position)
        halo.scale.setScalar(1.4 + 0.35 * Math.sin(t * 2.8 + i))
      }
    })
  })

  return (
    <group>
      <CinematicLight quality={quality} />
      <AnatomyTorso quality={quality} />
      <AxillaryChain
        quality={quality}
        activeNode={null}
        onActiveNode={() => undefined}
        interactive={false}
        showPath={false}
        reducedMotion={reducedMotion}
      />
      <LymphTube
        curve={path}
        radius={0.034}
        tubular={quality === 'high' ? 72 : 32}
        color={COLORS.vessel}
        glow
      />
      <LymphFlow curve={path} reducedMotion={reducedMotion} quality={quality} count={quality === 'high' ? 10 : 6} />
      {Array.from({ length: cellCount }).map((_, i) => {
        const u = reducedMotion ? (i + 0.5) / cellCount : 0
        const pos = path.getPointAt(u)
        return (
          <group key={i}>
            <mesh
              ref={(el) => {
                cells.current[i] = el
              }}
              position={pos}
              renderOrder={14}
            >
              <sphereGeometry args={[0.05, 12, 12]} />
              <OverlayMaterial
                color={COLORS.tumorCell}
                emissive={COLORS.tumorGlow}
                emissiveIntensity={1.05}
              />
            </mesh>
            <mesh
              ref={(el) => {
                glowHalos.current[i] = el
              }}
              position={pos}
              renderOrder={13}
            >
              <sphereGeometry args={[0.08, 10, 10]} />
              <meshBasicMaterial
                color={COLORS.tumorGlow}
                transparent
                opacity={0.22}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** Step 3 — clean educational cut-away (readable schematic inspired by HRA node topology). */
function CutawayLymphNode({ quality }: { quality: SceneQuality }) {
  const segs = quality === 'high' ? 48 : 28
  const follicleCount = quality === 'high' ? 10 : 7

  const follicles = useMemo(() => {
    const pts: [number, number, number, number][] = []
    for (let i = 0; i < follicleCount; i++) {
      const a = (i / follicleCount) * Math.PI * 1.55 + 0.35
      const r = 0.78
      pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.85, 0.12 + (i % 3) * 0.04, 0.09 + (i % 2) * 0.02])
    }
    return pts
  }, [follicleCount])

  return (
    <group>
      {/* Semi-transparent capsule shell — open cut-away toward camera (+Z) */}
      <mesh rotation={[0, 0, 0]} renderOrder={1}>
        <sphereGeometry args={[1.05, segs, segs, 0, Math.PI * 2, 0, Math.PI * 0.72]} />
        <meshPhysicalMaterial
          color={COLORS.nodeCapsule}
          transparent
          opacity={0.22}
          roughness={0.25}
          transmission={0.35}
          thickness={0.2}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Capsule rim */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.02]} renderOrder={2}>
        <torusGeometry args={[1.05, 0.028, 10, Math.max(32, segs)]} />
        <meshStandardMaterial
          color={COLORS.nodeCapsule}
          emissive={COLORS.vesselGlow}
          emissiveIntensity={0.35}
          roughness={0.35}
        />
      </mesh>
      {/* Cut face */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, 0]} renderOrder={0}>
        <circleGeometry args={[1.02, segs]} />
        <meshStandardMaterial color="#152028" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>

      {/* Cortex band (outer ring of tissue) */}
      <mesh position={[0, 0, 0.04]} renderOrder={3}>
        <ringGeometry args={[0.62, 0.95, segs]} />
        <meshStandardMaterial
          color={COLORS.cortex}
          emissive={COLORS.follicleGlow}
          emissiveIntensity={0.22}
          transparent
          opacity={0.62}
          roughness={0.8}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Follicles — soft translucent lymphoid pink-purple (not grey) */}
      {follicles.map((f, i) => (
        <mesh key={i} position={[f[0], f[1], f[2]]} renderOrder={4}>
          <sphereGeometry args={[f[3], 14, 14]} />
          <meshStandardMaterial
            color={COLORS.follicle}
            emissive={COLORS.follicleGlow}
            emissiveIntensity={0.95}
            roughness={0.48}
            transparent
            opacity={0.92}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* Paracortex */}
      <mesh position={[0.12, -0.05, 0.06]} renderOrder={3}>
        <sphereGeometry args={[0.42, segs, segs]} />
        <meshStandardMaterial
          color={COLORS.paracortex}
          transparent
          opacity={0.48}
          roughness={0.8}
          depthWrite={false}
        />
      </mesh>

      {/* Medulla (center) */}
      <mesh position={[-0.08, 0.02, 0.08]} renderOrder={3}>
        <sphereGeometry args={[0.28, segs, segs]} />
        <meshStandardMaterial
          color={COLORS.medulla}
          transparent
          opacity={0.55}
          roughness={0.75}
          depthWrite={false}
        />
      </mesh>

      {/* Afferent vessels entering capsule (left / top) */}
      {[
        { pos: [-1.35, 0.35, 0.15] as const, rot: [0, 0, 0.45] as const },
        { pos: [-1.28, -0.25, 0.1] as const, rot: [0, 0, -0.35] as const },
        { pos: [-1.15, 0.7, 0.12] as const, rot: [0, 0, 0.85] as const },
      ].map((v, i) => (
        <mesh key={`aff-${i}`} position={v.pos} rotation={v.rot} renderOrder={5}>
          <capsuleGeometry args={[0.045, 0.42, 4, 10]} />
          <meshStandardMaterial
            color={COLORS.vessel}
            emissive={COLORS.vesselGlow}
            emissiveIntensity={0.7}
            toneMapped={false}
            roughness={0.4}
          />
        </mesh>
      ))}

      {/* Efferent vessel at hilum (right) */}
      <mesh position={[1.35, -0.05, 0.1]} rotation={[0, 0, Math.PI / 2]} renderOrder={5}>
        <capsuleGeometry args={[0.055, 0.5, 4, 10]} />
        <meshStandardMaterial
          color={COLORS.vessel}
          emissive={COLORS.vesselGlow}
          emissiveIntensity={0.85}
          toneMapped={false}
          roughness={0.35}
        />
      </mesh>

      {/* Labels — clear of top-left legend; Afferent/Cortex hide on narrow screens */}
      <Html position={[0.25, 0.68, 0.3]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
        <span className="node-anno hide-sm">Cortex / follicles</span>
      </Html>
      <Html position={[0.42, 0.12, 0.4]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
        <span className="node-anno">Paracortex</span>
      </Html>
      <Html position={[-0.28, -0.08, 0.45]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
        <span className="node-anno soft">Medulla</span>
      </Html>
      <Html position={[-0.95, -0.85, 0.25]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
        <span className="node-anno hide-sm">Afferent</span>
      </Html>
      <Html position={[1.28, -0.7, 0.25]} center style={{ pointerEvents: 'none' }} zIndexRange={[20, 0]}>
        <span className="node-anno hide-sm">Efferent / hilum</span>
      </Html>
    </group>
  )
}

/** Proportionate deposits: ITC cells in subcapsular sinus, micro cluster, macro mass. */
function NodeDeposits({ mode }: { mode: DepositMode }) {
  const show = (id: DepositMode) => mode === 'all' || mode === id
  return (
    <group>
      {show('itc') &&
        [
          [-0.72, 0.55, 0.18],
          [-0.62, 0.48, 0.2],
          [-0.78, 0.42, 0.16],
        ].map((p, i) => (
          <mesh key={`itc-${i}`} position={p as [number, number, number]} renderOrder={8}>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshStandardMaterial
              color={COLORS.itc}
              emissive={COLORS.itc}
              emissiveIntensity={0.9}
              toneMapped={false}
            />
          </mesh>
        ))}
      {show('micro') && (
        <group position={[0.55, 0.35, 0.15]}>
          {[
            [0, 0, 0],
            [0.08, 0.05, 0.02],
            [-0.06, 0.06, 0.01],
            [0.04, -0.07, 0.03],
            [-0.05, -0.04, 0.02],
          ].map((p, i) => (
            <mesh key={`micro-${i}`} position={p as [number, number, number]} renderOrder={8}>
              <sphereGeometry args={[0.055, 14, 14]} />
              <meshStandardMaterial
                color={COLORS.micro}
                emissive={COLORS.micro}
                emissiveIntensity={0.75}
                toneMapped={false}
              />
            </mesh>
          ))}
        </group>
      )}
      {show('macro') && (
        <mesh position={[-0.2, -0.42, 0.1]} scale={[1.0, 0.75, 0.65]} renderOrder={7}>
          <sphereGeometry args={[0.22, 28, 28]} />
          <meshStandardMaterial
            color={COLORS.macro}
            emissive={COLORS.macro}
            emissiveIntensity={0.55}
            roughness={0.35}
            toneMapped={false}
            transparent
            opacity={0.9}
          />
        </mesh>
      )}
    </group>
  )
}

/** Step 3 — readable cut-away with optional deposit focus. */
export function InsideNodeScene({
  quality,
  reducedMotion,
  depositMode = 'all',
}: SceneProps & { depositMode?: DepositMode }) {
  const group = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (reducedMotion || !group.current) return
    group.current.rotation.y = Math.sin(clock.getElapsedTime() * 0.35) * 0.2
  })

  return (
    <group ref={group} position={[0, 0.05, 0]}>
      <MacroNodeLight quality={quality} />
      <CutawayLymphNode quality={quality} />
      <NodeDeposits mode={depositMode} />
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
            <sphereGeometry args={[i === 0 ? 0.1 : 0.078, segs, segs]} />
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
        <sphereGeometry args={[0.095, segs, segs]} />
        <OverlayMaterial color={COLORS.nodeHot} emissive={COLORS.nodeHot} emissiveIntensity={0.45} />
      </mesh>
      {LEVEL1_SATELLITES.map((p, i) => (
        <mesh key={`l1-${i}`} position={p} renderOrder={12}>
          <sphereGeometry args={[0.078, segs, segs]} />
          <OverlayMaterial color={COLORS.nodeHot} emissive={COLORS.nodeHot} emissiveIntensity={0.35} />
        </mesh>
      ))}
      <mesh position={landmark('level2')} renderOrder={12}>
        <sphereGeometry args={[0.09, segs, segs]} />
        <OverlayMaterial color={COLORS.nodeHot} emissive={COLORS.nodeHot} emissiveIntensity={0.42} />
      </mesh>
      <mesh position={landmark('level3')} renderOrder={12} scale={0.8}>
        <sphereGeometry args={[0.065, segs, segs]} />
        <OverlayMaterial color={COLORS.node} opacity={0.28} transparent />
      </mesh>
    </group>
  )
}

/**
 * Step 4 — SLNB vs ALND HRA female torso panels.
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
  const yaw = -0.28 // ~16° — keep axilla hollow readable without flaring the outer arm

  const showSlnb = surgeryMode === 'slnb' || surgeryMode === 'both'
  const showAlnd = surgeryMode === 'alnd' || surgeryMode === 'both'

  return (
    <group ref={group}>
      <CinematicLight quality={quality} />
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
 * Continuous mosaic plane + seam gutters so frames and the hot tile stay pixel-aligned.
 */
export function PatchesScene({ reducedMotion }: SceneProps) {
  const grid = PATCHES_LAYOUT.grid
  const TILE = PATCHES_LAYOUT.tile
  const GUTTER = PATCHES_LAYOUT.gutter
  const mosaicSize = grid * TILE
  const half = mosaicSize / 2
  const ZOOM_SCALE = 1.4

  const mosaicUrl = `${import.meta.env.BASE_URL}${patchesMeta.mosaicSrc}`
  const hotUrl = `${import.meta.env.BASE_URL}${patchesMeta.hotTile.src}`
  const [mosaicTex, hotBaseTex] = useTexture([mosaicUrl, hotUrl]) as [THREE.Texture, THREE.Texture]
  const labelRef = useRef<HTMLDivElement>(null)
  const [hotTex, setHotTex] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    mosaicTex.colorSpace = THREE.SRGBColorSpace
    mosaicTex.minFilter = THREE.NearestFilter
    mosaicTex.magFilter = THREE.NearestFilter
    mosaicTex.generateMipmaps = false
    mosaicTex.needsUpdate = true

    const img = hotBaseTex.image as HTMLImageElement | ImageBitmap | undefined
    const applyNearest = (tex: THREE.Texture) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.minFilter = THREE.NearestFilter
      tex.magFilter = THREE.NearestFilter
      tex.generateMipmaps = false
      tex.needsUpdate = true
    }
    if (!img) {
      applyNearest(hotBaseTex)
      setHotTex(hotBaseTex)
      return
    }
    const srcW = 'width' in img ? Number(img.width) : 96
    const srcH = 'height' in img ? Number(img.height) : 96
    const scale = 4
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(srcW * scale))
    canvas.height = Math.max(1, Math.round(srcH * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      applyNearest(hotBaseTex)
      setHotTex(hotBaseTex)
      return
    }
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img as CanvasImageSource, 0, 0, canvas.width, canvas.height)
    const crisp = new THREE.CanvasTexture(canvas)
    applyNearest(crisp)
    setHotTex(crisp)
    return () => {
      crisp.dispose()
    }
  }, [mosaicTex, hotBaseTex])

  const cellCenter = (row: number, col: number) => {
    const x = -half + TILE / 2 + col * TILE
    const y = half - TILE / 2 - row * TILE
    return [x, y] as const
  }

  const hotRow = patchesMeta.hotTile.row
  const hotCol = patchesMeta.hotTile.col
  const [hotLocalX, hotLocalY] = cellCenter(hotRow, hotCol)

  const mosaicGroup = useRef<Group>(null)
  const hotRoot = useRef<Group>(null)
  const hotVisual = useRef<Group>(null)
  const labelAnchor = useRef<Group>(null)

  useFrame(({ clock }) => {
    if (!hotRoot.current || !hotVisual.current || !mosaicGroup.current || !labelAnchor.current) {
      return
    }

    const placeLabel = (scale: number, zoomAmt: number) => {
      // Below the scaled patch once zoomed; mosaic is faded so this does not cover neighbors.
      const down = -(TILE * scale * 0.5 + 0.42)
      labelAnchor.current!.position.set(0, down * Math.max(zoomAmt, 0.001), 0.08)
    }

    const forced =
      typeof window !== 'undefined'
        ? (window as Window & { __EXPLAINER_PATCH_Z?: number }).__EXPLAINER_PATCH_Z
        : undefined

    let z: number
    if (typeof forced === 'number' && Number.isFinite(forced)) {
      z = THREE.MathUtils.clamp(forced, 0, 1)
    } else if (reducedMotion) {
      z = 1
    } else {
      const cycle = 8
      const t = clock.getElapsedTime() % cycle
      let raw = 0
      if (t < 2.6) raw = 0
      else if (t < 3.8) raw = (t - 2.6) / 1.2
      else if (t < 6.2) raw = 1
      else raw = 1 - (t - 6.2) / 1.8
      z = THREE.MathUtils.smoothstep(raw, 0, 1)
    }

    const lift = THREE.MathUtils.smoothstep(z, 0, 0.45)
    const zoom = THREE.MathUtils.smoothstep(z, 0.45, 1)

    const x = THREE.MathUtils.lerp(hotLocalX, 0, lift)
    const y = THREE.MathUtils.lerp(hotLocalY, 0.22, lift)
    const elev = THREE.MathUtils.lerp(0.02, 0.24, lift)
    const s = THREE.MathUtils.lerp(1, ZOOM_SCALE, zoom)
    hotRoot.current.position.set(x, y, elev)
    hotVisual.current.scale.setScalar(s)
    // Keep the rest pose mosaic-only so the hot tile cannot look offset in-grid.
    hotRoot.current.visible = lift > 0.02 || typeof forced === 'number' && forced > 0.02
    placeLabel(s, zoom)

    // Dim the mosaic slightly when zoomed so the lifted patch reads clearly
    mosaicGroup.current.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh || !mesh.userData.fadable) return
      const mat = mesh.material as THREE.MeshBasicMaterial
      if (mat && 'opacity' in mat) {
        const next = THREE.MathUtils.lerp(1, 0.18, lift)
        mat.opacity = next
        mat.transparent = next < 0.999
        mat.depthWrite = next >= 0.999
      }
    })

    if (labelRef.current) {
      if (typeof forced === 'number') {
        labelRef.current.style.opacity = z >= 0.85 ? '1' : '0'
      } else {
        const lo = zoom < 0.4 ? 0 : THREE.MathUtils.smoothstep((zoom - 0.4) / 0.35, 0, 1)
        labelRef.current.style.opacity = String(reducedMotion ? 1 : lo)
      }
    }
  })

  const frameStroke = Math.max(GUTTER * 1.15, 0.028)

  const makeFrame = (size: number, color: string, z: number) => {
    const s = frameStroke
    return (
      <group position={[0, 0, z]}>
        <mesh position={[0, size / 2 - s / 2, 0]}>
          <planeGeometry args={[size, s]} />
          <meshBasicMaterial color={color} toneMapped={false} depthWrite={false} depthTest={false} />
        </mesh>
        <mesh position={[0, -size / 2 + s / 2, 0]}>
          <planeGeometry args={[size, s]} />
          <meshBasicMaterial color={color} toneMapped={false} depthWrite={false} depthTest={false} />
        </mesh>
        <mesh position={[-size / 2 + s / 2, 0, 0]}>
          <planeGeometry args={[s, size - s * 2]} />
          <meshBasicMaterial color={color} toneMapped={false} depthWrite={false} depthTest={false} />
        </mesh>
        <mesh position={[size / 2 - s / 2, 0, 0]}>
          <planeGeometry args={[s, size - s * 2]} />
          <meshBasicMaterial color={color} toneMapped={false} depthWrite={false} depthTest={false} />
        </mesh>
      </group>
    )
  }

  // Cream seam lines ≈ 1–2 px gutters once camera-fitted
  const seamLines = useMemo(() => {
    const lines: ReactNode[] = []
    for (let i = 1; i < grid; i++) {
      const x = -half + i * TILE
      const y = half - i * TILE
      lines.push(
        <mesh key={`v-${i}`} position={[x, 0, 0.008]}>
          <planeGeometry args={[GUTTER, mosaicSize]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} depthWrite={false} />
        </mesh>,
      )
      lines.push(
        <mesh key={`h-${i}`} position={[0, y, 0.008]}>
          <planeGeometry args={[mosaicSize, GUTTER]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} depthWrite={false} />
        </mesh>,
      )
    }
    return lines
  }, [grid, half, mosaicSize])

  if (!hotTex) {
    return (
      <group>
        <ambientLight intensity={1} />
      </group>
    )
  }

  return (
    <group>
      <ambientLight intensity={1} />
      <directionalLight position={[1.5, 2, 4]} intensity={0.3} color="#fff8f0" />

      <group ref={mosaicGroup}>
        <mesh userData={{ fadable: true }} position={[0, 0, 0]}>
          <planeGeometry args={[mosaicSize, mosaicSize]} />
          <meshBasicMaterial map={mosaicTex} toneMapped={false} transparent opacity={1} />
        </mesh>
        {seamLines}
        {patchesMeta.tiles.map((t) => {
          if (!t.isTumor) return null
          const [x, y] = cellCenter(t.row, t.col)
          return (
            <group key={`frame-${t.row}-${t.col}`} position={[x, y, 0]}>
              {makeFrame(TILE * 0.985, COLORS.tumor, 0.015)}
            </group>
          )
        })}
      </group>

      <group ref={hotRoot} position={[hotLocalX, hotLocalY, 0.02]}>
        <group ref={hotVisual}>
          <mesh>
            <planeGeometry args={[TILE, TILE]} />
            <meshBasicMaterial map={hotTex} toneMapped={false} />
          </mesh>
          {makeFrame(TILE, COLORS.tumor, 0.01)}
          <mesh position={[0, 0, 0.014]}>
            <planeGeometry args={[TILE * (32 / 96), TILE * (32 / 96)]} />
            <meshBasicMaterial
              color={COLORS.tumor}
              transparent
              opacity={0.14}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {makeFrame(TILE * (32 / 96), '#fffcf6', 0.018)}
        </group>
        <group ref={labelAnchor} position={[0, -(TILE * 0.5 + 0.42), 0.08]}>
          <Html
            center
            distanceFactor={5.2}
            style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
            zIndexRange={[40, 0]}
          >
            <div ref={labelRef} className="patch-float-label" style={{ opacity: 0 }}>
              <strong>96×96 patch</strong>
              <span>Ground truth: tumor</span>
              <em>Center 32×32 decides the label</em>
            </div>
          </Html>
        </group>
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
      return <InsideNodeScene {...props} depositMode={props.depositMode ?? 'all'} />
    case 'surgery':
      return <SurgeryScene {...props} />
    case 'patches':
      return <PatchesScene {...props} />
    default:
      return null
  }
}
