import { Environment, Lightformer } from '@react-three/drei'
import { COLORS } from './colors'
import type { SceneQuality } from './AnatomyTorso'

/**
 * Cinematic key + strong rim — low ambient so glass skin and glow read.
 */
export function CinematicLight({ quality }: { quality: SceneQuality }) {
  const high = quality === 'high'
  return (
    <>
      {/* Slightly higher ambient so glass folds do not collapse to dark-red blotches */}
      <ambientLight intensity={0.1} color={COLORS.fillSoft} />
      <hemisphereLight args={['#1e3848', '#050a10', 0.32]} />
      {/* Neutral-cool key — warm keys tint pec/clavicle valleys brown under glass */}
      <directionalLight
        position={[2.8, 4.2, 3.2]}
        intensity={high ? 1.35 : 1.05}
        color="#e8f2f0"
      />
      {/* Strong cool rim / backlight from behind-left */}
      <directionalLight
        position={[-4.2, 2.4, -3.5]}
        intensity={high ? 1.85 : 1.35}
        color={COLORS.rimCool}
      />
      {/* Soft fill into clavicle/pec fold from front-left */}
      <directionalLight position={[-1.4, 1.8, 3.2]} intensity={0.42} color="#7eb8b4" />
      <directionalLight position={[0.2, -1.2, 2.8]} intensity={0.22} color="#4a7080" />
      {/* Breast-area fill stays cool (was #ffc9a8 — warmed folds into brown smudges) */}
      <pointLight position={[0.7, 0.4, 1.2]} intensity={0.35} color="#c8e4e0" distance={5} />
      <pointLight position={[-1.2, 0.6, -0.8]} intensity={0.45} color="#5ee0d0" distance={4} />
      <Environment resolution={high ? 256 : 128} environmentIntensity={high ? 0.2 : 0.12}>
        <Lightformer
          form="rect"
          intensity={1.4}
          color="#dceeea"
          scale={[6, 2.5, 1]}
          position={[2, 4, 3]}
          target={[0, 0.2, 0]}
        />
        <Lightformer
          form="ring"
          intensity={2.2}
          color="#5ec8c0"
          scale={4.5}
          position={[-3.8, 1.5, -2.5]}
          target={[0, 0.3, 0]}
        />
        <Lightformer
          form="rect"
          intensity={0.35}
          color="#050a12"
          scale={[12, 8, 1]}
          position={[0, -3, 0]}
          target={[0, 0.4, 0]}
        />
      </Environment>
    </>
  )
}

/** Macro lighting for the step-3 cut-away node. */
export function MacroNodeLight({ quality }: { quality: SceneQuality }) {
  const high = quality === 'high'
  return (
    <>
      <ambientLight intensity={0.12} color={COLORS.fillSoft} />
      <hemisphereLight args={['#203848', '#050a10', 0.3]} />
      <directionalLight position={[3.2, 3.8, 4]} intensity={high ? 1.25 : 1.0} color={COLORS.keyWarm} />
      <directionalLight position={[-3.2, 1.2, -2]} intensity={0.95} color={COLORS.rimCool} />
      <pointLight position={[0.3, 0.5, 1.8]} intensity={0.55} color="#ffe0c8" distance={5} />
    </>
  )
}
