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
}

/** Procedural fallback if GLB fails to load (keeps explainer usable offline / on GL errors). */
export function ProceduralTorsoFallback({
  quality,
  showTumor = true,
  showInternals = true,
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
      <mesh position={[0.28, 0.15, 0.42]}>
        <sphereGeometry args={[0.24, segs, segs]} />
        <meshStandardMaterial color="#c4a790" transparent opacity={0.8} />
      </mesh>
      {showTumor && (
        <mesh position={landmark('tumor')}>
          <sphereGeometry args={[0.07, 16, 16]} />
          <meshStandardMaterial color={COLORS.tumor} emissive={COLORS.tumor} emissiveIntensity={0.4} />
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

function applyMaterials(root: THREE.Object3D) {
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return
    const mesh = obj as THREE.Mesh
    const name = (mesh.name || mesh.parent?.name || '').toLowerCase()
    if (name.includes('skin')) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: COLORS.skinTranslucent,
        roughness: 0.55,
        metalness: 0.02,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    } else if (name.includes('pec') || name.includes('deltoid')) {
      mesh.material = new THREE.MeshStandardMaterial({
        color: '#b35a5a',
        roughness: 0.72,
        metalness: 0.04,
        transparent: true,
        opacity: 0.82,
      })
    } else {
      mesh.material = new THREE.MeshStandardMaterial({
        color: '#e6dfd2',
        roughness: 0.68,
        metalness: 0.05,
        transparent: true,
        opacity: 0.9,
      })
    }
    mesh.castShadow = false
    mesh.receiveShadow = false
  })
}

function GlbTorso({ showTumor = true, showInternals = true }: Omit<TorsoProps, 'quality'>) {
  const { scene } = useGLTF(TORSO_URL, true)
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    applyMaterials(c)
    return c
  }, [scene])

  return (
    <group scale={TORSO_SCALE}>
      <primitive object={cloned} />
      {/* Soft breast volume at UOQ for educational clarity on the male atlas torso */}
      <mesh position={landmarksData.landmarks.tumor as [number, number, number]} scale={[1.15, 1, 1.05]}>
        <sphereGeometry args={[0.055, 20, 20]} />
        <meshStandardMaterial color="#c4a790" transparent opacity={0.55} roughness={0.7} depthWrite={false} />
      </mesh>
      {showTumor && (
        <mesh position={landmarksData.landmarks.tumor as [number, number, number]}>
          <sphereGeometry args={[0.016, 16, 16]} />
          <meshStandardMaterial
            color={COLORS.tumor}
            emissive={COLORS.tumor}
            emissiveIntensity={0.45}
            roughness={0.3}
          />
        </mesh>
      )}
      {showInternals &&
        (['im_1', 'im_2', 'im_3'] as const).map((k) => (
          <mesh key={k} position={landmarksData.landmarks[k] as [number, number, number]}>
            <sphereGeometry args={[0.007, 10, 10]} />
            <meshStandardMaterial color={COLORS.node} transparent opacity={0.4} />
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
      <GlbTorso showTumor={props.showTumor} showInternals={props.showInternals} />
    </AnatomyErrorBoundary>
  )
}

// Warm the Draco decoder + GLB once the explainer chunk loads.
useGLTF.preload(TORSO_URL, true)
