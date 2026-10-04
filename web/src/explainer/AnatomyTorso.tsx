import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { COLORS } from './colors'
import landmarksData from './landmarks.json'
import { boundsFromMeshMeters, setTorsoBounds } from './cameraFit'

export type SceneQuality = 'high' | 'low'

/** Uniform scale applied to the BodyParts3D-derived GLB (meters → scene units). */
export const TORSO_SCALE = 5

export type LandmarkKey = keyof typeof landmarksData.landmarks

export function landmark(key: LandmarkKey): [number, number, number] {
  const p = landmarksData.landmarks[key]
  return [p[0] * TORSO_SCALE, p[1] * TORSO_SCALE, p[2] * TORSO_SCALE]
}

export const TORSO_URL = `${import.meta.env.BASE_URL}models/explainer/upper_torso.glb`

// Seed camera fit from authored mesh bounds (overwritten at runtime when GLB loads).
const boundsMeta = landmarksData as unknown as {
  bounds_m?: { min: number[]; max: number[] }
}
if (boundsMeta.bounds_m) {
  const { min, max } = boundsMeta.bounds_m
  boundsFromMeshMeters(
    [min[0], min[1], min[2]],
    [max[0], max[1], max[2]],
  )
}

type TorsoProps = {
  quality: SceneQuality
  showTumor?: boolean
  showInternals?: boolean
  showBreast?: boolean
  /** Dim non-essential geometry when used in small comparative panels. */
  dimmed?: boolean
}

/** Teardrop breast mound sitting ON the pec (flat back, bulk anterior, tail to axilla). */
function BreastMound({ opacity = 0.28 }: { opacity?: number }) {
  const geom = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 32, 24)
    const pos = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      const ax = Math.max(0, -v.x)
      // Flatten against chest wall; keep bulk anterior (+Z)
      if (v.z < 0) {
        v.z *= 0.08 // collapse into pec contact
      } else {
        v.z *= 0.55 + 0.1 * (1 - ax)
      }
      v.y *= 0.7
      v.x *= 1.05 + 0.9 * ax // axillary tail of Spence
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    pos.needsUpdate = true
    g.computeVertexNormals()
    return g
  }, [])

  const breast = landmarksData.landmarks.breast as [number, number, number]
  return (
    <mesh geometry={geom} position={breast} scale={[0.058, 0.046, 0.05]} renderOrder={6}>
      <meshStandardMaterial
        color="#c9b4a0"
        transparent
        opacity={opacity}
        roughness={0.88}
        metalness={0.01}
        depthWrite={false}
        depthTest
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

/** Soft fade near crop planes so neck / waist / arm cuts don't look torn. */
function attachCropFade(mat: THREE.MeshStandardMaterial, yFade = 0.14, xFade = 0.28) {
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
        // Soften superior/inferior crop and distal arm cuts (mesh-local meters)
        float yEdge = min(0.195 - abs(vCropPos.y), uYFade);
        float xEdge = uXFade - abs(vCropPos.x);
        float fadeY = smoothstep(0.0, uYFade, max(yEdge, 0.0));
        float fadeX = smoothstep(0.0, 0.055, max(xEdge, 0.0));
        float fade = clamp(fadeY * fadeX, 0.0, 1.0);
        gl_FragColor.a *= fade;
        if (gl_FragColor.a < 0.03) discard;
        #include <dithering_fragment>
        `,
      )
  }
  mat.customProgramCacheKey = () => `cropfade-v3-${yFade}-${xFade}`
}

function applyMaterials(root: THREE.Object3D, dimmed = false) {
  const skinOp = dimmed ? 0.22 : 0.28
  // Muscle translucent so axillary nodes behind the lateral edge still read;
  // low enough that the anterior tumor is not buried in pec color.
  const muscleOp = dimmed ? 0.38 : 0.45
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    const name = (mesh.name || mesh.parent?.name || '').toLowerCase()
    if (name.includes('skin')) {
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS.skinTranslucent,
        roughness: 0.7,
        metalness: 0.02,
        transparent: true,
        opacity: skinOp,
        depthWrite: false,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 2,
      })
      attachCropFade(mat, 0.13, 0.29)
      mesh.material = mat
      mesh.renderOrder = 0
    } else if (name.includes('pec') || name.includes('deltoid')) {
      const mat = new THREE.MeshStandardMaterial({
        color: '#a85252',
        roughness: 0.78,
        metalness: 0.04,
        transparent: true,
        opacity: muscleOp,
        depthWrite: false,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      })
      attachCropFade(mat, 0.12, 0.28)
      mesh.material = mat
      mesh.renderOrder = 1
    } else {
      const mat = new THREE.MeshStandardMaterial({
        color: '#e2d8c8',
        roughness: 0.72,
        metalness: 0.05,
        transparent: true,
        opacity: dimmed ? 0.65 : 0.82,
        depthWrite: true,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
      attachCropFade(mat, 0.12, 0.28)
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

  useEffect(() => {
    // Measure loaded mesh in scene units for camera fit
    const box = new THREE.Box3().setFromObject(cloned)
    // setFromObject includes scale only after parent scale — measure in meters then scale
    const local = new THREE.Box3()
    cloned.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh
        mesh.geometry.computeBoundingBox()
        const b = mesh.geometry.boundingBox
        if (b) local.union(b)
      }
    })
    if (!local.isEmpty()) {
      setTorsoBounds(
        new THREE.Box3(
          local.min.clone().multiplyScalar(TORSO_SCALE),
          local.max.clone().multiplyScalar(TORSO_SCALE),
        ),
      )
    } else if (!box.isEmpty()) {
      setTorsoBounds(box)
    }
  }, [cloned])

  return (
    <group scale={TORSO_SCALE}>
      <primitive object={cloned} />
      {showBreast && <BreastMound opacity={dimmed ? 0.22 : 0.32} />}
      {showTumor && (
        <group position={landmarksData.landmarks.tumor as [number, number, number]}>
          {/* Solid red tumor clearly anterior to pec */}
          <mesh renderOrder={14}>
            <sphereGeometry args={[0.018, 18, 18]} />
            <meshStandardMaterial
              color={COLORS.tumor}
              emissive={COLORS.tumor}
              emissiveIntensity={0.85}
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
