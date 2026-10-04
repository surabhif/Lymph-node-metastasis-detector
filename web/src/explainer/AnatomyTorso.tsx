import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { COLORS } from './colors'
import landmarksData from './landmarks.json'
import { boundsFromMeshMeters, setTorsoBounds } from './cameraFit'

export type SceneQuality = 'high' | 'low'

/** Scene units per HRA/VH metre after recentering on the breast. */
export const TORSO_SCALE = 5

/** Visible Human Female origin shift so the right breast sits near scene origin. */
export const HRA_CENTER = (landmarksData as unknown as { hra_center_m: [number, number, number] }).hra_center_m

export type LandmarkKey = keyof typeof landmarksData.landmarks

export function landmark(key: LandmarkKey): [number, number, number] {
  const p = landmarksData.landmarks[key]
  return [
    (p[0] - HRA_CENTER[0]) * TORSO_SCALE,
    (p[1] - HRA_CENTER[1]) * TORSO_SCALE,
    (p[2] - HRA_CENTER[2]) * TORSO_SCALE,
  ]
}

export const SKIN_URL = `${import.meta.env.BASE_URL}models/explainer/skin_torso.glb`
export const MAMMARY_URL = `${import.meta.env.BASE_URL}models/explainer/mammary_r.glb`
export const LYMPH_NODE_URL = `${import.meta.env.BASE_URL}models/explainer/lymph_node.glb`
export const BP3D_CHEST_URL = `${import.meta.env.BASE_URL}models/explainer/bp3d_chest.glb`
/** Legacy full torso — kept as procedural-fallback companion. */
export const TORSO_URL = `${import.meta.env.BASE_URL}models/explainer/upper_torso.glb`

const boundsMeta = landmarksData as unknown as {
  bounds_m?: { min: number[]; max: number[] }
}
if (boundsMeta.bounds_m) {
  const { min, max } = boundsMeta.bounds_m
  const c = HRA_CENTER
  boundsFromMeshMeters(
    [(min[0] - c[0]), (min[1] - c[1]), (min[2] - c[2])],
    [(max[0] - c[0]), (max[1] - c[1]), (max[2] - c[2])],
  )
}

type TorsoProps = {
  quality: SceneQuality
  showTumor?: boolean
  showInternals?: boolean
  showBreast?: boolean
  dimmed?: boolean
}

function toScenePos(p: [number, number, number]): [number, number, number] {
  return [
    (p[0] - HRA_CENTER[0]) * TORSO_SCALE,
    (p[1] - HRA_CENTER[1]) * TORSO_SCALE,
    (p[2] - HRA_CENTER[2]) * TORSO_SCALE,
  ]
}

/** Soft Fresnel rim for translucent female skin (cheap SSS stand-in). */
function makeSkinMaterial(opacity: number) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: COLORS.skinTranslucent,
    roughness: 0.55,
    metalness: 0.0,
    transmission: 0.12,
    thickness: 0.35,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.FrontSide,
    sheen: 0.35,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#f0dcc8'),
    clearcoat: 0.08,
    clearcoatRoughness: 0.7,
  })
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <output_fragment>',
      `
      #include <output_fragment>
      float fres = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), 2.4);
      gl_FragColor.rgb += vec3(0.55, 0.42, 0.36) * fres * 0.35;
      `,
    )
  }
  mat.customProgramCacheKey = () => 'hra-skin-fresnel-v1'
  return mat
}

function makeBreastMaterial(opacity: number) {
  return new THREE.MeshPhysicalMaterial({
    color: COLORS.breastSoft,
    roughness: 0.72,
    metalness: 0.0,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.FrontSide,
    sheen: 0.45,
    sheenColor: new THREE.Color('#e8c4b0'),
    sheenRoughness: 0.55,
  })
}

function makeMuscleMaterial(opacity: number) {
  return new THREE.MeshStandardMaterial({
    color: '#9a4e4e',
    roughness: 0.78,
    metalness: 0.04,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.FrontSide,
  })
}

function makeBoneMaterial(opacity: number) {
  return new THREE.MeshStandardMaterial({
    color: '#e2d8c8',
    roughness: 0.7,
    metalness: 0.05,
    transparent: true,
    opacity,
    depthWrite: true,
    side: THREE.FrontSide,
  })
}

function applyNamedMaterials(root: THREE.Object3D, kind: 'skin' | 'breast' | 'chest', dimmed: boolean) {
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    const name = (mesh.name || mesh.parent?.name || '').toLowerCase()
    if (kind === 'skin') {
      mesh.material = makeSkinMaterial(dimmed ? 0.18 : 0.32)
      mesh.renderOrder = 0
    } else if (kind === 'breast') {
      mesh.material = makeBreastMaterial(dimmed ? 0.35 : 0.55)
      mesh.renderOrder = 2
    } else {
      if (name.includes('pec') || name.includes('deltoid')) {
        mesh.material = makeMuscleMaterial(dimmed ? 0.25 : 0.38)
        mesh.renderOrder = 1
      } else {
        mesh.material = makeBoneMaterial(dimmed ? 0.45 : 0.7)
        mesh.renderOrder = 1
      }
    }
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
}

/** Procedural fallback if HRA GLBs fail. */
export function ProceduralTorsoFallback({
  quality,
  showTumor = true,
  showInternals = true,
  showBreast = true,
}: TorsoProps) {
  const segs = quality === 'high' ? 40 : 20
  const lathe = useMemo(() => {
    const pts = [
      new THREE.Vector2(0.14, 1.2),
      new THREE.Vector2(0.42, 0.95),
      new THREE.Vector2(0.55, 0.7),
      new THREE.Vector2(0.5, 0.2),
      new THREE.Vector2(0.46, -0.5),
    ]
    return new THREE.LatheGeometry(pts, segs)
  }, [segs])

  return (
    <group>
      <mesh geometry={lathe}>
        <meshStandardMaterial color={COLORS.skinDeep} transparent opacity={0.7} roughness={0.9} />
      </mesh>
      <mesh position={[0.7, 0.45, 0]} rotation={[0.2, 0.1, -1.1]}>
        <capsuleGeometry args={[0.14, 0.5, 4, segs]} />
        <meshStandardMaterial color={COLORS.skin} transparent opacity={0.8} />
      </mesh>
      <mesh position={[-0.7, 0.45, 0]} rotation={[0.2, -0.1, 1.1]}>
        <capsuleGeometry args={[0.14, 0.45, 4, segs]} />
        <meshStandardMaterial color={COLORS.skin} transparent opacity={0.75} />
      </mesh>
      {showBreast && (
        <mesh position={landmark('breast')} scale={[1.5, 0.9, 0.55]}>
          <sphereGeometry args={[0.2, segs, segs]} />
          <meshStandardMaterial color={COLORS.breastSoft} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      )}
      {showTumor && (
        <mesh position={landmark('tumor')} renderOrder={10}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial
            color={COLORS.tumor}
            emissive={COLORS.tumor}
            emissiveIntensity={0.85}
            toneMapped={false}
            depthTest={false}
          />
        </mesh>
      )}
      {showInternals &&
        (['im_1', 'im_2', 'im_3'] as const).map((k) => (
          <mesh key={k} position={landmark(k)}>
            <sphereGeometry args={[0.03, 10, 10]} />
            <meshStandardMaterial color={COLORS.node} transparent opacity={0.35} />
          </mesh>
        ))}
    </group>
  )
}

function HraSkin({ dimmed }: { dimmed: boolean }) {
  const { scene } = useGLTF(SKIN_URL, true)
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    applyNamedMaterials(c, 'skin', dimmed)
    return c
  }, [scene, dimmed])
  return <primitive object={cloned} />
}

function HraMammary({ dimmed }: { dimmed: boolean }) {
  const { scene } = useGLTF(MAMMARY_URL, true)
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    applyNamedMaterials(c, 'breast', dimmed)
    return c
  }, [scene, dimmed])
  return <primitive object={cloned} />
}

/**
 * BodyParts3D pecs/clavicles/sternum — lightly scaled to sit under HRA skin.
 * Male mesh inside female skin is approximate; kept translucent for axillary depth cues.
 */
function Bp3dChest({ dimmed }: { dimmed: boolean }) {
  const { scene } = useGLTF(BP3D_CHEST_URL, true)
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    applyNamedMaterials(c, 'chest', dimmed)
    return c
  }, [scene, dimmed])
  // Tuned offset: BP3D crop was recentered on male chest; nudge into HRA breast frame.
  return (
    <group position={[0.05, -0.12, -0.08]} scale={0.92} rotation={[0.08, 0.02, 0]}>
      <primitive object={cloned} />
    </group>
  )
}

function TumorMarker() {
  return (
    <group position={landmark('tumor')}>
      <mesh renderOrder={14}>
        <sphereGeometry args={[0.055, 20, 20]} />
        <meshStandardMaterial
          color={COLORS.tumor}
          emissive={COLORS.tumor}
          emissiveIntensity={1.1}
          toneMapped={false}
          roughness={0.35}
        />
      </mesh>
      <mesh renderOrder={13}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshBasicMaterial
          color={COLORS.tumor}
          transparent
          opacity={0.18}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

function GlbFemaleTorso({
  showTumor = true,
  showInternals = true,
  showBreast = true,
  dimmed = false,
}: Omit<TorsoProps, 'quality'>) {
  useEffect(() => {
    const c = HRA_CENTER
    const b = boundsMeta.bounds_m
    if (!b) return
    setTorsoBounds(
      new THREE.Box3(
        new THREE.Vector3(
          (b.min[0] - c[0]) * TORSO_SCALE,
          (b.min[1] - c[1]) * TORSO_SCALE,
          (b.min[2] - c[2]) * TORSO_SCALE,
        ),
        new THREE.Vector3(
          (b.max[0] - c[0]) * TORSO_SCALE,
          (b.max[1] - c[1]) * TORSO_SCALE,
          (b.max[2] - c[2]) * TORSO_SCALE,
        ),
      ),
    )
  }, [])

  return (
    <group>
      <group
        position={[-HRA_CENTER[0] * TORSO_SCALE, -HRA_CENTER[1] * TORSO_SCALE, -HRA_CENTER[2] * TORSO_SCALE]}
        scale={TORSO_SCALE}
      >
        <HraSkin dimmed={dimmed} />
        {showBreast && <HraMammary dimmed={dimmed} />}
      </group>
      {/* BP3D chest already authored in centered scene metres × TORSO_SCALE */}
      <Bp3dChest dimmed={dimmed} />
      {showTumor && <TumorMarker />}
      {showInternals &&
        (['im_1', 'im_2', 'im_3'] as const).map((k) => (
          <mesh key={k} position={landmark(k)} renderOrder={8}>
            <sphereGeometry args={[0.028, 10, 10]} />
            <meshStandardMaterial color={COLORS.node} transparent opacity={0.28} depthWrite={false} />
          </mesh>
        ))}
    </group>
  )
}

class AnatomyErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.warn('[explainer] Anatomy GLB failed; using procedural fallback', err, info)
  }
  render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

/**
 * HRA female skin + right mammary (CC BY 4.0), with optional BodyParts3D pec/bone cues.
 */
export function AnatomyTorso(props: TorsoProps) {
  const fallback = <ProceduralTorsoFallback {...props} />
  return (
    <AnatomyErrorBoundary fallback={fallback}>
      <GlbFemaleTorso
        showTumor={props.showTumor}
        showInternals={props.showInternals}
        showBreast={props.showBreast}
        dimmed={props.dimmed}
      />
    </AnatomyErrorBoundary>
  )
}

useGLTF.preload(SKIN_URL, true)
useGLTF.preload(MAMMARY_URL, true)
useGLTF.preload(BP3D_CHEST_URL, true)
// Lymph-node interior is lazy-loaded only when step 3 mounts (see scenes.tsx).

export { toScenePos }

export function preloadLymphNode() {
  useGLTF.preload(LYMPH_NODE_URL, true)
}
