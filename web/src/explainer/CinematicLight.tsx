import { Environment, Lightformer } from '@react-three/drei'
import { COLORS } from './colors'
import type { SceneQuality } from './AnatomyTorso'

/**
 * Cinematic key + strong rim — Environment/Lightformer restore the glass
 * fresnel/rim look from Phase 1 while lights stay cool (smudge fix).
 */
export function CinematicLight({ quality }: { quality: SceneQuality }) {
  const high = quality === 'high'
  return (
    <>
      <ambientLight intensity={0.1} color={COLORS.fillSoft} />
      <hemisphereLight args={['#1e3848', '#050a10', 0.32]} />
      <directionalLight
        position={[2.8, 4.2, 3.2]}
        intensity={high ? 1.35 : 1.05}
        color="#e8f2f0"
      />
      <directionalLight
        position={[-4.2, 2.4, -3.5]}
        intensity={high ? 1.85 : 1.35}
        color={COLORS.rimCool}
      />
      <directionalLight position={[-1.4, 1.8, 3.2]} intensity={0.42} color="#7eb8b4" />
      <directionalLight position={[0.2, -1.2, 2.8]} intensity={0.22} color="#4a7080" />
      <pointLight position={[0.7, 0.4, 1.2]} intensity={0.35} color="#c8e4e0" distance={5} />
      <pointLight position={[-1.2, 0.6, -0.8]} intensity={0.45} color="#5ee0d0" distance={4} />
      <Environment resolution={high ? 256 : 128} environmentIntensity={high ? 0.22 : 0.14}>
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
      <ambientLight intensity={0.14} color={COLORS.fillSoft} />
      <hemisphereLight args={['#203848', '#050a10', 0.32]} />
      <directionalLight position={[3.2, 3.8, 4]} intensity={high ? 1.15 : 0.95} color="#e8f0ee" />
      <directionalLight position={[-3.2, 1.2, -2]} intensity={0.9} color={COLORS.rimCool} />
      <pointLight position={[0.3, 0.5, 1.8]} intensity={0.45} color="#c8e4e0" distance={5} />
    </>
  )
}
