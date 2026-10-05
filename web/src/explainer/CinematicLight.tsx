import { COLORS } from './colors'
import type { SceneQuality } from './AnatomyTorso'

/**
 * Cinematic key + strong rim — pure three.js lights (no drei Environment /
 * Lightformer) so the HDR/gainmap path stays out of the bundle.
 */
export function CinematicLight({ quality }: { quality: SceneQuality }) {
  const high = quality === 'high'
  return (
    <>
      {/* Slightly higher ambient so glass folds do not collapse to dark-red blotches */}
      <ambientLight intensity={0.12} color={COLORS.fillSoft} />
      <hemisphereLight args={['#1e3848', '#050a10', 0.36]} />
      {/* Neutral-cool key — warm keys tint pec/clavicle valleys brown under glass */}
      <directionalLight
        position={[2.8, 4.2, 3.2]}
        intensity={high ? 1.45 : 1.1}
        color="#e8f2f0"
      />
      {/* Strong cool rim / backlight from behind-left */}
      <directionalLight
        position={[-4.2, 2.4, -3.5]}
        intensity={high ? 2.05 : 1.45}
        color={COLORS.rimCool}
      />
      {/* Soft fill into clavicle/pec fold from front-left */}
      <directionalLight position={[-1.4, 1.8, 3.2]} intensity={0.48} color="#7eb8b4" />
      <directionalLight position={[0.2, -1.2, 2.8]} intensity={0.26} color="#4a7080" />
      {/* Soft top bounce standing in for the former rect Lightformer */}
      <directionalLight position={[2, 5, 1.5]} intensity={high ? 0.35 : 0.22} color="#dceeea" />
      {/* Breast-area fill stays cool (was #ffc9a8 — warmed folds into brown smudges) */}
      <pointLight position={[0.7, 0.4, 1.2]} intensity={0.38} color="#c8e4e0" distance={5} />
      <pointLight position={[-1.2, 0.6, -0.8]} intensity={0.5} color="#5ee0d0" distance={4} />
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
