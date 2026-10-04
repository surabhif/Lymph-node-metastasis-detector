import { Suspense, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import type { ExplainerStepId } from './steps'
import { SceneForStep, type SceneQuality } from './scenes'

type Props = {
  stepId: ExplainerStepId
  quality: SceneQuality
  reducedMotion: boolean
  activeNode: string | null
  onActiveNode: (id: string | null) => void
}

function cameraFor(stepId: ExplainerStepId): [number, number, number] {
  switch (stepId) {
    case 'lymphatic':
      return [2.6, 1.4, 3.2]
    case 'spread':
      return [2.4, 1.2, 3.0]
    case 'inside':
      return [0, 0.2, 3.2]
    case 'surgery':
      return [0, 0.4, 4.2]
    case 'patches':
      return [0, 0.2, 3.6]
    default:
      return [2.5, 1.5, 3.2]
  }
}

export default function ExplainerCanvas({
  stepId,
  quality,
  reducedMotion,
  activeNode,
  onActiveNode,
}: Props) {
  const position = useMemo(() => cameraFor(stepId), [stepId])
  const dpr: [number, number] = quality === 'high' ? [1, 1.75] : [1, 1.25]
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!mounted) return null

  return (
    <Canvas
      key={stepId}
      className="explainer-canvas"
      dpr={dpr}
      camera={{ position, fov: 42, near: 0.1, far: 40 }}
      gl={{ antialias: quality === 'high', powerPreference: 'default', alpha: true }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0)
      }}
      aria-hidden="true"
    >
      <Suspense fallback={null}>
        <SceneForStep
          stepId={stepId}
          quality={quality}
          reducedMotion={reducedMotion}
          activeNode={activeNode}
          onActiveNode={onActiveNode}
        />
        <ContactShadows
          position={[0, -1.35, 0]}
          opacity={0.28}
          scale={8}
          blur={2.2}
          far={3.5}
        />
        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={2.2}
          maxDistance={7}
          maxPolarAngle={Math.PI * 0.82}
          autoRotate={false}
          makeDefault
        />
      </Suspense>
    </Canvas>
  )
}
