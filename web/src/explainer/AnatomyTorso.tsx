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
export const TORSO_URL = `${import.meta.env.BASE_URL}models/explainer/upper_torso.glb`
export const DRACO_PATH = `${import.meta.env.BASE_URL}draco/`

const boundsMeta = landmarksData as unknown as {
  bounds_m?: { min: number[]; max: number[] }
}
if (boundsMeta.bounds_m) {
  const { min, max } = boundsMeta.bounds_m
  const c = HRA_CENTER
  boundsFromMeshMeters(
    [min[0] - c[0], min[1] - c[1], min[2] - c[2]],
    [max[0] - c[0], max[1] - c[1], max[2] - c[2]],
  )
}

/** World-Y (scene units) where the neck crop soft-fades. */
const NECK_FADE_START = 0.95
const NECK_FADE_END = 1.42

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

/**
 * Glassy translucent skin: low center opacity, cool fresnel rim, soft neck alpha fade.
 * Drawn last (high renderOrder) so internals read as inside the shell.
 */
function makeSkinMaterial(baseOpacity: number) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(COLORS.skinTranslucent).multiplyScalar(1.2),
    roughness: 0.15,
    metalness: 0.0,
    transmission: 0.78,
    thickness: 0.85,
    ior: 1.33,
    transparent: true,
    opacity: baseOpacity,
    depthWrite: false,
    side: THREE.FrontSide,
    sheen: 0.7,
    sheenRoughness: 0.3,
    sheenColor: new THREE.Color(COLORS.skinRim),
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.25,
  })
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNeckStart = { value: NECK_FADE_START }
    shader.uniforms.uNeckEnd = { value: NECK_FADE_END }
    shader.uniforms.uBaseOpacity = { value: baseOpacity }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGlassWorldPos;
        varying vec3 vGlassViewN;
        varying vec3 vGlassViewP;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vGlassWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vGlassViewN = normalize(mat3(modelViewMatrix) * normal);
        vGlassViewP = -mvPosition.xyz;`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGlassWorldPos;
        varying vec3 vGlassViewN;
        varying vec3 vGlassViewP;
        uniform float uNeckStart;
        uniform float uNeckEnd;
        uniform float uBaseOpacity;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        float ndv = saturate(dot(normalize(vGlassViewN), normalize(vGlassViewP)));
        float fres = pow(1.0 - ndv, 2.4);
        gl_FragColor.rgb += vec3(0.55, 0.95, 0.92) * fres * 1.35;
        float faceAlpha = mix(uBaseOpacity * 0.18, min(0.82, uBaseOpacity + fres * 0.7), fres);
        float neckFade = 1.0 - smoothstep(uNeckStart, uNeckEnd, vGlassWorldPos.y);
        if (neckFade <= 0.01) discard;
        gl_FragColor.a = faceAlpha * neckFade;
        `,
      )
  }
  mat.customProgramCacheKey = () => `hra-glass-skin-v5-${baseOpacity.toFixed(2)}`
  return mat
}

/** Soft pale glowing lobule tissue — not brown blobs. */
function makeLobuleMaterial(opacity: number) {
  return new THREE.MeshPhysicalMaterial({
    color: '#f7efe8',
    roughness: 0.45,
    metalness: 0.0,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.FrontSide,
    emissive: new THREE.Color('#ffe8dc'),
    emissiveIntensity: 0.42,
    sheen: 0.7,
    sheenColor: new THREE.Color('#fff6f0'),
    sheenRoughness: 0.35,
    transmission: 0.15,
    thickness: 0.25,
  })
}

function applySkinMaterials(root: THREE.Object3D, dimmed: boolean) {
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    mesh.material = makeSkinMaterial(dimmed ? 0.12 : 0.16)
    mesh.renderOrder = 20
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
}

/**
 * Keep lobules / ducts only — drop fat shell so the skin breast is the outer contour.
 */
function applyMammaryMaterials(root: THREE.Object3D, dimmed: boolean) {
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    const name = (mesh.name || mesh.parent?.name || '').toLowerCase()
    // Fat was reading as a second breast shell floating in front — hide it.
    if (name.includes('fat')) {
      mesh.visible = false
      return
    }
    mesh.visible = true
    const isDuct = /sinus|duct|lactiferous/.test(name)
    const mat = makeLobuleMaterial(dimmed ? 0.3 : isDuct ? 0.42 : 0.52)
    if (isDuct) {
      mat.emissiveIntensity = 0.38
      mat.opacity = dimmed ? 0.28 : 0.42
    }
    mesh.material = mat
    mesh.renderOrder = 4
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
}

function TumorMarker() {
  return (
    <group position={landmark('tumor')}>
      <mesh renderOrder={12}>
        <sphereGeometry args={[0.048, 20, 20]} />
        <meshStandardMaterial
          color={COLORS.tumor}
          emissive={COLORS.tumorGlow}
          emissiveIntensity={1.4}
          toneMapped={false}
          roughness={0.35}
        />
      </mesh>
      <mesh renderOrder={11} scale={1.55}>
        <sphereGeometry args={[0.048, 16, 16]} />
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
}

export function ProceduralTorsoFallback({
  quality,
  showTumor = true,
  showInternals: _showInternals = true,
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
      <mesh geometry={lathe} renderOrder={20}>
        <meshPhysicalMaterial
          color={COLORS.skinTranslucent}
          transparent
          opacity={0.22}
          roughness={0.3}
          transmission={0.4}
          depthWrite={false}
        />
      </mesh>
      {showBreast && (
        <mesh position={landmark('breast')} scale={[1.2, 0.85, 0.7]} renderOrder={4}>
          <sphereGeometry args={[0.16, segs, segs]} />
          <meshStandardMaterial
            color={COLORS.breastSoft}
            emissive={COLORS.breastGlow}
            emissiveIntensity={0.25}
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </mesh>
      )}
      {showTumor && (
        <mesh position={landmark('tumor')} renderOrder={10}>
          <sphereGeometry args={[0.055, 16, 16]} />
          <meshStandardMaterial
            color={COLORS.tumor}
            emissive={COLORS.tumorGlow}
            emissiveIntensity={1.2}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  )
}

function HraSkin({ dimmed }: { dimmed: boolean }) {
  const { scene } = useGLTF(SKIN_URL, DRACO_PATH)
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    applySkinMaterials(c, dimmed)
    return c
  }, [scene, dimmed])
  return <primitive object={cloned} />
}

/** Mammary AABB center from mammary_r.glb POSITION accessor (VH meters). */
const MAMMARY_CENTER_M: [number, number, number] = [-0.1059569, 0.41539925, 0.05461578]
/**
 * Seat target inside the glass right-breast mound (toward nipple / UOQ side).
 * More lateral (−X), higher, and more anterior than the raw HRA mammary center.
 */
const MAMMARY_TARGET_M: [number, number, number] = [-0.188, 0.505, 0.088]

function HraMammary({ dimmed }: { dimmed: boolean }) {
  const { scene } = useGLTF(MAMMARY_URL, DRACO_PATH)
  const object = useMemo(() => {
    const c = scene.clone(true)
    applyMammaryMaterials(c, dimmed)
    // Origin = AABB center so scale/rotation never pivot through VH world origin
    c.position.set(-MAMMARY_CENTER_M[0], -MAMMARY_CENTER_M[1], -MAMMARY_CENTER_M[2])
    return c
  }, [scene, dimmed])
  return (
    <group position={MAMMARY_TARGET_M} scale={1.28} rotation={[0.12, -0.08, 0.03]}>
      <primitive object={object} />
    </group>
  )
}

function GlbFemaleTorso({
  showTumor = true,
  showInternals: _showInternals = true,
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
        {/* Internals first, glass skin last so it softly occludes */}
        {showBreast && <HraMammary dimmed={dimmed} />}
        <HraSkin dimmed={dimmed} />
      </group>
      {/* BP3D pec/chest cues dropped — male fragments could not be aligned cleanly under HRA skin. */}
      {showTumor && <TumorMarker />}
      {/* Internal mammary chain omitted — read as stray mid-chest dots against glass skin. */}
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

useGLTF.preload(SKIN_URL, DRACO_PATH)
useGLTF.preload(MAMMARY_URL, DRACO_PATH)

export { toScenePos }

export function preloadLymphNode() {
  useGLTF.preload(LYMPH_NODE_URL, DRACO_PATH)
}
