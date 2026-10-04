import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type { ExplainerStepId } from './steps'
import { SceneForStep, type SceneQuality } from './scenes'
import { cameraTargetFor, getTorsoBounds } from './cameraFit'
import { PostFX } from './PostFX'

export type SurgeryMode = 'slnb' | 'alnd' | 'both'

type Props = {
  stepId: ExplainerStepId
  quality: SceneQuality
  reducedMotion: boolean
  activeNode: string | null
  onActiveNode: (id: string | null) => void
  surgeryMode?: SurgeryMode
}

function CameraRig({
  stepId,
  reducedMotion,
  mobile,
  controlsRef,
  surgeryMode,
}: {
  stepId: ExplainerStepId
  reducedMotion: boolean
  mobile: boolean
  controlsRef: React.RefObject<OrbitControlsImpl | null>
  surgeryMode: SurgeryMode
}) {
  const { camera, size } = useThree()
  const target = useRef(new THREE.Vector3())
  const desiredPos = useRef(new THREE.Vector3())
  const desiredLook = useRef(new THREE.Vector3())
  const initialized = useRef(false)
  const aspect = Math.max(size.width / Math.max(size.height, 1), 0.35)
  const fov = mobile ? 40 : 38
  const surgerySingle = surgeryMode !== 'both'

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }, [camera, fov])

  useEffect(() => {
    const cfg = cameraTargetFor(stepId, mobile, aspect, surgerySingle)
    desiredPos.current.set(...cfg.position)
    desiredLook.current.set(...cfg.lookAt)
    // First mount only: place camera immediately. Later step changes tween via useFrame.
    if (!initialized.current || reducedMotion) {
      camera.position.copy(desiredPos.current)
      target.current.copy(desiredLook.current)
      camera.lookAt(target.current)
      if (controlsRef.current) {
        controlsRef.current.target.copy(target.current)
        controlsRef.current.update()
      }
      initialized.current = true
    }
  }, [stepId, mobile, aspect, camera, controlsRef, reducedMotion, surgerySingle])

  useEffect(() => {
    const id = window.setInterval(() => {
      const b = getTorsoBounds()
      if (b.isEmpty()) return
      const cfg = cameraTargetFor(stepId, mobile, aspect, surgerySingle)
      desiredPos.current.set(...cfg.position)
      desiredLook.current.set(...cfg.lookAt)
    }, 400)
    const stop = window.setTimeout(() => window.clearInterval(id), 2500)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(stop)
    }
  }, [stepId, mobile, aspect, surgerySingle])

  useFrame((_, dt) => {
    if (reducedMotion) {
      // Snap when motion is reduced so framing stays exact.
      camera.position.copy(desiredPos.current)
      target.current.copy(desiredLook.current)
      if (controlsRef.current) {
        controlsRef.current.target.copy(desiredLook.current)
        controlsRef.current.update()
      } else {
        camera.lookAt(target.current)
      }
      return
    }
    // Smooth cinematic tween between steps (slower than the old snap).
    const k = 1 - Math.exp(-dt * 2.1)
    camera.position.lerp(desiredPos.current, k)
    target.current.lerp(desiredLook.current, k)
    if (controlsRef.current) {
      controlsRef.current.target.lerp(desiredLook.current, k)
      controlsRef.current.update()
    } else {
      camera.lookAt(target.current)
    }
  })

  return null
}

export default function ExplainerCanvas({
  stepId,
  quality,
  reducedMotion,
  activeNode,
  onActiveNode,
  surgeryMode = 'both',
}: Props) {
  const mobile = quality === 'low'
  const dpr: [number, number] = quality === 'high' ? [1, 1.75] : [1, 1.2]
  const [mounted, setMounted] = useState(true)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const surgerySingle = surgeryMode !== 'both'
  const start = cameraTargetFor(
    stepId,
    mobile,
    mobile ? 390 / 360 : 800 / 576,
    surgerySingle,
  )

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!mounted) return null

  const shadowY = getTorsoBounds().min.y - 0.08
  const isPatches = stepId === 'patches'
  const isInside = stepId === 'inside'

  return (
    <Canvas
      className="explainer-canvas"
      dpr={dpr}
      camera={{ position: start.position, fov: mobile ? 40 : 38, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: 'default', alpha: true }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.12
      }}
      aria-hidden="true"
    >
      <Suspense fallback={null}>
        <CameraRig
          stepId={stepId}
          reducedMotion={reducedMotion}
          mobile={mobile}
          controlsRef={controlsRef}
          surgeryMode={surgeryMode}
        />
        <SceneForStep
          stepId={stepId}
          quality={quality}
          reducedMotion={reducedMotion}
          activeNode={activeNode}
          onActiveNode={onActiveNode}
          surgeryMode={surgeryMode}
        />
        {!isPatches && !isInside && (
          <ContactShadows position={[0, shadowY, 0]} opacity={0.28} scale={12} blur={2.6} far={5} />
        )}
        {!isPatches && (
          <PostFX quality={quality} reducedMotion={reducedMotion} enabled />
        )}
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableZoom={!isPatches}
          enableRotate={!isPatches}
          minDistance={isPatches ? 4.5 : 1.6}
          maxDistance={12}
          maxPolarAngle={Math.PI * 0.78}
          minPolarAngle={0.15}
          enableDamping={!isPatches}
          dampingFactor={0.08}
          makeDefault
        />
      </Suspense>
    </Canvas>
  )
}
