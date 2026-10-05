import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type { ExplainerStepId } from './steps'
import { EXPLAINER_STEPS } from './steps'
import type { DepositMode, SceneQuality } from './scenes'
import { cameraTargetFor, getTorsoBounds } from './cameraFit'
import { buildCameraPaths } from './scrollPath'
import { CinematicWorld } from './CinematicWorld'
import { isSoftGpu } from './gpuDetect'
import { ExplainerCanvasBoundary } from './ExplainerCanvasBoundary'
import ExplainerFallback from './ExplainerFallback'

/** PostFX (bloom/vignette/DOF) loads async so postprocessing stays out of the canvas critical chunk. */
const PostFX = lazy(() => import('./PostFX').then((m) => ({ default: m.PostFX })))
/** Discrete step scenes only for the non-scroll fallback path. */
const SceneForStep = lazy(() =>
  import('./scenes').then((m) => ({ default: m.SceneForStep })),
)

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
    const k = 1 - Math.exp(-dt * 32)
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

function ExplainerCanvasInner({
  stepId,
  quality,
  reducedMotion,
  activeNode,
  onActiveNode,
  surgeryMode = 'both',
  depositMode = 'all',
  progress = 0,
  scrollDriven = false,
  onContextLost,
}: Props & { onContextLost: () => void }) {
  const mobile = quality === 'low'
  const dpr: [number, number] = quality === 'high' ? [1, 1.5] : [1, 1.15]
  const [canvasReady, setCanvasReady] = useState(false)
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const surgerySingle = surgeryMode !== 'both'
  const start = cameraTargetFor(
    stepId,
    mobile,
    mobile ? 390 / 360 : 800 / 576,
    surgerySingle,
  )
  // Cached once — never probe WebGL per progress tick.
  const softGpu = useMemo(() => isSoftGpu(), [])
  const particleCount = quality === 'high' ? (softGpu ? 4500 : 14000) : 2000

  const isPatches = stepId === 'patches'
  const orbitEnabled = !scrollDriven || isPatches

  return (
    <Canvas
      className={`explainer-canvas${canvasReady ? ' is-ready' : ''}`}
      dpr={dpr}
      camera={{ position: start.position, fov: mobile ? 40 : 38, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: 'default', alpha: true }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.28
        const el = gl.domElement
        const onLost = (ev: Event) => {
          ev.preventDefault()
          console.warn('[explainer] webglcontextlost — switching to static fallback')
          onContextLost()
        }
        const onRestored = () => {
          console.info('[explainer] webglcontextrestored')
        }
        el.addEventListener('webglcontextlost', onLost, false)
        el.addEventListener('webglcontextrestored', onRestored, false)
        requestAnimationFrame(() => setCanvasReady(true))
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
            <CinematicWorld
              progress={progress}
              quality={quality}
              reducedMotion={reducedMotion}
              activeNode={activeNode}
              onActiveNode={onActiveNode}
              surgeryMode={surgeryMode}
              depositMode={depositMode}
              particleCount={particleCount}
            />
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
            <Suspense fallback={null}>
              <SceneForStep
                stepId={stepId}
                quality={quality}
                reducedMotion={reducedMotion}
                activeNode={activeNode}
                onActiveNode={onActiveNode}
                surgeryMode={surgeryMode}
                depositMode={depositMode}
              />
            </Suspense>
          </>
        )}
        {!isPatches && (
          <Suspense fallback={null}>
            <PostFX
              quality={quality}
              reducedMotion={reducedMotion}
              enabled
              focusAxilla={scrollDriven && (stepId === 'lymphatic' || stepId === 'spread' || stepId === 'surgery')}
            />
          </Suspense>
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

export default function ExplainerCanvas(props: Props) {
  const [forceStatic, setForceStatic] = useState(false)
  const step = EXPLAINER_STEPS.find((s) => s.id === props.stepId) ?? EXPLAINER_STEPS[0]!

  if (forceStatic) {
    return <ExplainerFallback step={step} />
  }

  return (
    <ExplainerCanvasBoundary stepId={props.stepId} onError={() => setForceStatic(true)}>
      <ExplainerCanvasInner {...props} onContextLost={() => setForceStatic(true)} />
    </ExplainerCanvasBoundary>
  )
}
