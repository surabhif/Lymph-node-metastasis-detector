import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type { ExplainerStepId } from './steps'
import { SceneForStep, type SceneQuality } from './scenes'
import { cameraTargetFor, getTorsoBounds } from './cameraFit'

type Props = {
  stepId: ExplainerStepId
  quality: SceneQuality
  reducedMotion: boolean
  activeNode: string | null
  onActiveNode: (id: string | null) => void
}

function CameraRig({
  stepId,
  reducedMotion,
  mobile,
  controlsRef,
}: {
  stepId: ExplainerStepId
  reducedMotion: boolean
  mobile: boolean
  controlsRef: React.RefObject<OrbitControlsImpl | null>
}) {
  const { camera, size } = useThree()
  const target = useRef(new THREE.Vector3())
  const desiredPos = useRef(new THREE.Vector3())
  const desiredLook = useRef(new THREE.Vector3())
  const initialized = useRef(false)
  const aspect = Math.max(size.width / Math.max(size.height, 1), 0.35)
  const fov = mobile ? 42 : 40

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }, [camera, fov])

  useEffect(() => {
    const cfg = cameraTargetFor(stepId, mobile, aspect)
    desiredPos.current.set(...cfg.position)
    desiredLook.current.set(...cfg.lookAt)
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
  }, [stepId, mobile, aspect, camera, controlsRef, reducedMotion])

  // Re-fit when torso bounds update after GLB load (first frame may have seeded bounds)
  useEffect(() => {
    const id = window.setInterval(() => {
      const b = getTorsoBounds()
      if (b.isEmpty()) return
      const cfg = cameraTargetFor(stepId, mobile, aspect)
      desiredPos.current.set(...cfg.position)
      desiredLook.current.set(...cfg.lookAt)
      if (!initialized.current) {
        camera.position.copy(desiredPos.current)
        if (controlsRef.current) {
          controlsRef.current.target.copy(desiredLook.current)
          controlsRef.current.update()
        }
        initialized.current = true
      }
    }, 400)
    const stop = window.setTimeout(() => window.clearInterval(id), 2500)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(stop)
    }
  }, [stepId, mobile, aspect, camera, controlsRef])

  useFrame((_, dt) => {
    if (reducedMotion) return
    const k = 1 - Math.exp(-dt * 3.2)
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
}: Props) {
  const mobile = quality === 'low'
  const dpr: [number, number] = quality === 'high' ? [1, 1.75] : [1, 1.2]
  const [mounted, setMounted] = useState(true)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const start = cameraTargetFor(stepId, mobile, mobile ? 390 / 420 : 800 / 576)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!mounted) return null

  // Contact shadow under the expanded crop
  const shadowY = getTorsoBounds().min.y - 0.08

  return (
    <Canvas
      className="explainer-canvas"
      dpr={dpr}
      camera={{ position: start.position, fov: mobile ? 42 : 40, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: 'default', alpha: true }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
      aria-hidden="true"
    >
      <Suspense fallback={null}>
        <CameraRig
          stepId={stepId}
          reducedMotion={reducedMotion}
          mobile={mobile}
          controlsRef={controlsRef}
        />
        <SceneForStep
          stepId={stepId}
          quality={quality}
          reducedMotion={reducedMotion}
          activeNode={activeNode}
          onActiveNode={onActiveNode}
        />
        <ContactShadows position={[0, shadowY, 0]} opacity={0.22} scale={12} blur={2.8} far={5} />
        <Environment preset="apartment" environmentIntensity={0.28} />
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableZoom
          minDistance={1.6}
          maxDistance={10}
          maxPolarAngle={Math.PI * 0.78}
          minPolarAngle={0.15}
          enableDamping
          dampingFactor={0.08}
          makeDefault
        />
      </Suspense>
    </Canvas>
  )
}
