import { Component, type ErrorInfo, type ReactNode, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { COLORS } from './colors'
import landmarksData from './landmarks.json'

export type SceneQuality = 'high' | 'low'

/** Uniform scale applied to the BodyParts3D-derived GLB (meters → scene units). */
export const TORSO_SCALE = 5

export type LandmarkKey = keyof typeof landmarksData.landmarks

export function landmark(key: LandmarkKey): [number, number, number] {
  const p = landmarksData.landmarks[key]
  return [p[0] * TORSO_SCALE, p[1] * TORSO_SCALE, p[2] * TORSO_SCALE]
}

export const TORSO_URL = `${import.meta.env.BASE_URL}models/explainer/upper_torso.glb`

type TorsoProps = {
  quality: SceneQuality
  showTumor?: boolean
  showInternals?: boolean
  showBreast?: boolean
  /** Dim non-essential geometry when used in small comparative panels. */
  dimmed?: boolean
}

/** Teardrop breast mound: flattened on pec, tapering toward axilla (tail of Spence). */
function BreastMound({ opacity = 0.18 }: { opacity?: number }) {
  const geom = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 32, 24)
    const pos = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const ax = Math.max(0, -v.x)
      // Flatten hard against chest; collapse posterior hemisphere into pec
      v.z = v.z < 0 ? v.z * 0.12 : v.z * (0.32 + 0.08 * (1 - ax))
      v.y *= 0.68
      v.x *= 1.1 + 1.0 * ax // axillary tail
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    pos.needsUpdate = true
    g.computeVertexNormals()
    return g
  }, [])

  const breast = landmarksData.landmarks.breast as [number, number, number]
  return (
    <mesh geometry={geom} position={breast} scale={[0.062, 0.048, 0.042]} renderOrder={2}>
      <meshStandardMaterial
        color="#c4b09a"
        transparent
        opacity={opacity}
        roughness={0.9}
        metalness={0.01}
        depthWrite={false}
        side={THREE.FrontSide}
      />
    </mesh>
  )
}

/** Procedural fallback if GLB fails to load (keeps explainer usable offline / on GL errors). */
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
          <meshStandardMaterial color="#c4a790" transparent opacity={0.28} depthWrite={false} />
        </mesh>
      )}
      {showTumor && (
        <mesh position={landmark('tumor')} renderOrder={10}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial
            color={COLORS.tumor}
            emissive={COLORS.tumor}
            emissiveIntensity={0.55}
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

function attachCropFade(mat: THREE.MeshStandardMaterial, yFade = 0.11, xFade = 0.22) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uYFade = { value: yFade }
    shader.uniforms.uXFade = { value: xFade }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vCropPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvCropPos = position;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nvarying vec3 vCropPos;\nuniform float uYFade;\nuniform float uXFade;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `
        float yEdge = 0.19 - abs(vCropPos.y);
        float xEdge = uXFade - abs(vCropPos.x);
        float fade = smoothstep(0.0, uYFade, yEdge) * smoothstep(0.0, 0.045, max(xEdge, 0.0));
        fade = clamp(fade, 0.0, 1.0);
        gl_FragColor.a *= fade;
        if (gl_FragColor.a < 0.035) discard;
        #include <dithering_fragment>
        `,
      )
  }
  mat.customProgramCacheKey = () => `cropfade-v2-${yFade}-${xFade}`
}

function applyMaterials(root: THREE.Object3D, dimmed = false) {
  const skinOp = dimmed ? 0.2 : 0.26
  const muscleOp = dimmed ? 0.75 : 0.88
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    const name = (mesh.name || mesh.parent?.name || '').toLowerCase()
    if (name.includes('skin')) {
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS.skinTranslucent,
        roughness: 0.68,
        metalness: 0.02,
        transparent: true,
        opacity: skinOp,
        depthWrite: false,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 2,
      })
      attachCropFade(mat, 0.1, 0.24)
      mesh.material = mat
      mesh.renderOrder = 0
    } else if (name.includes('pec') || name.includes('deltoid')) {
      const mat = new THREE.MeshStandardMaterial({
        color: '#a85252',
        roughness: 0.76,
        metalness: 0.04,
        transparent: true,
        opacity: muscleOp,
        depthWrite: true,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
      attachCropFade(mat, 0.08, 0.23)
      mesh.material = mat
      mesh.renderOrder = 1
    } else {
      const mat = new THREE.MeshStandardMaterial({
        color: '#e2d8c8',
        roughness: 0.72,
        metalness: 0.05,
        transparent: true,
        opacity: dimmed ? 0.7 : 0.85,
        depthWrite: true,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
      attachCropFade(mat, 0.08, 0.23)
      mesh.material = mat
      mesh.renderOrder = 1
    }
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
}

function GlbTorso({
  showTumor = true,
  showInternals = true,
  showBreast = true,
  dimmed = false,
}: Omit<TorsoProps, 'quality'>) {
  const { scene } = useGLTF(TORSO_URL, true)
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    applyMaterials(c, dimmed)
    return c
  }, [scene, dimmed])

  return (
    <group scale={TORSO_SCALE}>
      <primitive object={cloned} />
      {showBreast && <BreastMound opacity={dimmed ? 0.12 : 0.16} />}
      {showTumor && (
        <group position={landmarksData.landmarks.tumor as [number, number, number]} renderOrder={12}>
          {/* Soft halo so the tumor reads through translucent skin */}
          <mesh renderOrder={12}>
            <sphereGeometry args={[0.032, 18, 18]} />
            <meshStandardMaterial
              color={COLORS.tumor}
              emissive={COLORS.tumor}
              emissiveIntensity={0.45}
              transparent
              opacity={0.4}
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          <mesh renderOrder={13}>
            <sphereGeometry args={[0.019, 18, 18]} />
            <meshStandardMaterial
              color={COLORS.tumor}
              emissive={COLORS.tumor}
              emissiveIntensity={1.0}
              roughness={0.25}
              toneMapped={false}
              depthTest={false}
              depthWrite={false}
            />
          </mesh>
        </group>
      )}
      {showInternals &&
        (['im_1', 'im_2', 'im_3'] as const).map((k) => (
          <mesh
            key={k}
            position={landmarksData.landmarks[k] as [number, number, number]}
            renderOrder={8}
          >
            <sphereGeometry args={[0.007, 10, 10]} />
            <meshStandardMaterial
              color={COLORS.node}
              transparent
              opacity={0.3}
              depthWrite={false}
            />
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
 * BodyParts3D-derived upper torso (lazy GLB). Falls back to procedural geometry on error.
 * Suspense for the GLB bubbles to ExplainerCanvas so the existing “Loading 3D scene…” state shows.
 */
export function AnatomyTorso(props: TorsoProps) {
  const fallback = <ProceduralTorsoFallback {...props} />
  return (
    <AnatomyErrorBoundary fallback={fallback}>
      <GlbTorso
        showTumor={props.showTumor}
        showInternals={props.showInternals}
        showBreast={props.showBreast}
        dimmed={props.dimmed}
      />
    </AnatomyErrorBoundary>
  )
}

// Warm the Draco decoder + GLB once the explainer chunk loads.
useGLTF.preload(TORSO_URL, true)
