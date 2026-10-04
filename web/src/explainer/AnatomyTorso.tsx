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

/** Teardrop breast mound: flattened against pec, tapering toward the axilla (tail of Spence). */
function BreastMound({ opacity = 0.28 }: { opacity?: number }) {
  const geom = useMemo(() => {
    // Unit sphere deformed into a flattened teardrop pointing toward −X (axilla)
    const g = new THREE.SphereGeometry(1, 28, 20)
    const pos = g.attributes.position as THREE.BufferAttribute
    const v = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i)
      // Flatten against chest (reduce Z), widen slightly in Y, stretch toward axilla (−X)
      const ax = Math.max(0, -v.x) // 0..1 toward axilla
      v.z *= 0.42 + 0.08 * (1 - ax) // flatter, especially toward axilla
      v.y *= 0.78
      v.x *= 1.15 + 0.55 * ax // axillary tail of Spence
      // Soften the chest-wall back so it sits on the pec rather than floating
      if (v.z < 0) v.z *= 0.35
      pos.setXYZ(i, v.x, v.y, v.z)
    }
    pos.needsUpdate = true
    g.computeVertexNormals()
    return g
  }, [])

  const breast = landmarksData.landmarks.breast as [number, number, number]
  return (
    <mesh
      geometry={geom}
      position={breast}
      scale={[0.052, 0.048, 0.048]}
      renderOrder={2}
    >
      <meshStandardMaterial
        color="#c9b09a"
        transparent
        opacity={opacity}
        roughness={0.82}
        metalness={0.02}
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
        <mesh position={landmark('breast')} scale={[1.35, 0.95, 0.7]}>
          <sphereGeometry args={[0.2, segs, segs]} />
          <meshStandardMaterial color="#c4a790" transparent opacity={0.35} depthWrite={false} />
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

function applyMaterials(root: THREE.Object3D, dimmed = false) {
  const skinOp = dimmed ? 0.28 : 0.34
  const muscleOp = dimmed ? 0.7 : 0.8
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    const name = (mesh.name || mesh.parent?.name || '').toLowerCase()
    if (name.includes('skin')) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: COLORS.skinTranslucent,
        roughness: 0.62,
        metalness: 0.02,
        transparent: true,
        opacity: skinOp,
        depthWrite: false,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      })
      mesh.renderOrder = 0
    } else if (name.includes('pec') || name.includes('deltoid')) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: '#b35a5a',
        roughness: 0.74,
        metalness: 0.04,
        transparent: true,
        opacity: muscleOp,
        depthWrite: true,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
      mesh.renderOrder = 1
    } else {
      mesh.material = new THREE.MeshStandardMaterial({
        color: '#e6dfd2',
        roughness: 0.7,
        metalness: 0.05,
        transparent: true,
        opacity: dimmed ? 0.75 : 0.88,
        depthWrite: true,
        side: THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
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
      {showBreast && <BreastMound opacity={dimmed ? 0.2 : 0.26} />}
      {showTumor && (
        <mesh position={landmarksData.landmarks.tumor as [number, number, number]} renderOrder={12}>
          <sphereGeometry args={[0.018, 18, 18]} />
          <meshStandardMaterial
            color={COLORS.tumor}
            emissive={COLORS.tumor}
            emissiveIntensity={0.65}
            roughness={0.28}
            toneMapped={false}
            depthTest={false}
          />
        </mesh>
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
              opacity={0.35}
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
