import { Environment, Lightformer } from '@react-three/drei'
import { COLORS } from './colors'
import type { SceneQuality } from './AnatomyTorso'

/**
 * Self-contained cinematic lighting — no CDN Environment preset.
 * Soft key + cool rim + Lightformer IBL stand in for a small Poly Haven HDRI
 * (studio_small_09 is CC0; see web/public/hdri/README.md).
 */
export function CinematicLight({ quality }: { quality: SceneQuality }) {
  const high = quality === 'high'
  return (
    <>
      {/* Intentional low fill — form comes from key/rim, not ambient wash */}
      <ambientLight intensity={0.08} color={COLORS.fillSoft} />
      <hemisphereLight args={[COLORS.keyWarm, COLORS.fillSoft, 0.18]} />
      <directionalLight
        position={[3.2, 4.8, 2.6]}
        intensity={high ? 1.35 : 1.05}
        color={COLORS.keyWarm}
      />
      <directionalLight
        position={[-3.4, 1.6, -2.2]}
        intensity={high ? 0.55 : 0.4}
        color={COLORS.rimCool}
      />
      <directionalLight position={[0.4, 2.2, -3.5]} intensity={0.22} color="#f2e8dc" />
      <pointLight position={[0.85, 0.55, 1.4]} intensity={0.35} color="#ffd8c4" distance={6} />
      <Environment resolution={high ? 256 : 128} environmentIntensity={high ? 0.42 : 0.28}>
        <Lightformer
          form="rect"
          intensity={2.4}
          color="#fff6ec"
          scale={[8, 3, 1]}
          position={[0, 4.5, 2]}
          target={[0, 0.2, 0]}
        />
        <Lightformer
          form="ring"
          intensity={1.1}
          color={COLORS.rimCool}
          scale={5}
          position={[-3.5, 1.2, -2]}
          target={[0, 0.3, 0]}
        />
        <Lightformer
          form="rect"
          intensity={0.55}
          color="#1c2624"
          scale={[10, 6, 1]}
          position={[0, -2.5, 0]}
          target={[0, 0.4, 0]}
        />
      </Environment>
    </>
  )
}

/** Softer macro lighting for the step-3 node interior. */
export function MacroNodeLight({ quality }: { quality: SceneQuality }) {
  const high = quality === 'high'
  return (
    <>
      <ambientLight intensity={0.22} color="#f4f7f4" />
      <hemisphereLight args={['#f8f5ef', '#9aabb0', 0.28]} />
      <directionalLight position={[2.8, 3.6, 4]} intensity={high ? 1.05 : 0.85} color="#fff8f0" />
      <directionalLight position={[-2.4, 0.8, 1.6]} intensity={0.35} color={COLORS.rimCool} />
      <pointLight position={[0.2, 0.4, 1.6]} intensity={0.45} color="#ffe8d6" distance={5} />
    </>
  )
}
