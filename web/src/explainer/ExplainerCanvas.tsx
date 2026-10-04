import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type { ExplainerStepId } from './steps'
import { SceneForStep, type DepositMode, type SceneQuality } from './scenes'
import { cameraTargetFor, getTorsoBounds } from './cameraFit'
import { PostFX } from './PostFX'
import { buildCameraPaths, axillaryPathCurve } from './scrollPath'
import { InstancedTumorCells } from './InstancedTumorCells'

export type SurgeryMode = 'slnb' | 'alnd' | 'both'

type Props = {
  stepId: ExplainerStepId
  quality: SceneQuality
  reducedMotion: boolean
  activeNode: string | null
  onActiveNode: (id: string | null) => void
  surgeryMode?: SurgeryMode
  depositMode?: DepositMode
  /** 0–1 scroll scrub. When set with scrollDriven, drives continuous camera + world. */
  progress?: number
  /** Prefer scroll-cinematic path over discrete step scenes. */
  scrollDriven?: boolean
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

/** Scrubs camera along CatmullRom path from scroll progress. */
function ScrollCameraRig({
  progress,
  reducedMotion,
  mobile,
  controlsRef,
}: {
  progress: number
  reducedMotion: boolean
  mobile: boolean
  controlsRef: React.RefObject<OrbitControlsImpl | null>
}) {
  const { camera, size } = useThree()
  const aspect = Math.max(size.width / Math.max(size.height, 1), 0.35)
  const paths = useMemo(() => buildCameraPaths(mobile, aspect), [mobile, aspect])
  const target = useRef(new THREE.Vector3())
  const desiredPos = useRef(new THREE.Vector3())
  const desiredLook = useRef(new THREE.Vector3())
  const initialized = useRef(false)
  const fov = mobile ? 40 : 38

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }, [camera, fov])

  useEffect(() => {
    const cfg = paths.sample(progress)
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
  }, [progress, paths, camera, controlsRef, reducedMotion])

  useFrame((_, dt) => {
    const cfg = paths.sample(progress)
    desiredPos.current.set(...cfg.position)
    desiredLook.current.set(...cfg.lookAt)
    if (reducedMotion) {
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
    const k = 1 - Math.exp(-dt * 10)
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
  depositMode = 'all',
  progress = 0,
  scrollDriven = false,
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
  const particleCount = quality === 'high' ? 160 : 48

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!mounted) return null

  const isPatches = stepId === 'patches'
  // During scroll scrub, allow gentle orbit nudge but prefer scroll ownership
  const orbitEnabled = !scrollDriven || isPatches
  // Spread step: stream instanced cells along the vessel as a motion layer
  const showCells = scrollDriven && stepId === 'spread'
  const cellPath = useMemo(() => (showCells ? axillaryPathCurve() : null), [showCells])
  // Keep progress referenced so scroll scrub state stays wired for future camera path
  const cellIntensity = showCells ? 0.55 + 0.45 * Math.min(1, Math.abs(progress - 0.25) * 4) : 0

  return (
    <Canvas
      className="explainer-canvas"
      dpr={dpr}
      camera={{ position: start.position, fov: mobile ? 40 : 38, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: 'default', alpha: true }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.28
      }}
      aria-hidden="true"
    >
      <Suspense fallback={null}>
        {scrollDriven ? (
          <>
            <ScrollCameraRig
              progress={progress}
              reducedMotion={reducedMotion}
              mobile={mobile}
              controlsRef={controlsRef}
            />
            <SceneForStep
              key={stepId}
              stepId={stepId}
              quality={quality}
              reducedMotion={reducedMotion}
              activeNode={activeNode}
              onActiveNode={onActiveNode}
              surgeryMode={surgeryMode}
              depositMode={depositMode}
            />
            {showCells && cellPath && (
              <InstancedTumorCells
                curve={cellPath}
                count={particleCount}
                reducedMotion={reducedMotion}
                intensity={cellIntensity}
              />
            )}
          </>
        ) : (
          <>
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
              depositMode={depositMode}
            />
          </>
        )}
        {!isPatches && (
          <PostFX quality={quality} reducedMotion={reducedMotion} enabled />
        )}
        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableZoom={!isPatches && !scrollDriven}
          enableRotate={orbitEnabled && !isPatches}
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
