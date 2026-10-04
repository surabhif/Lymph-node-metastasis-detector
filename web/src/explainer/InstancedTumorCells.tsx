import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS } from './colors'

type Props = {
  curve: THREE.Curve<THREE.Vector3>
  count: number
  reducedMotion: boolean
  /** 0–1 how strongly cells stream (step 2 peak). */
  intensity: number
  /** Called when a cell arrives near the sentinel (u≈sentinelU). */
  onArrive?: (strength: number) => void
  sentinelU?: number
}

/**
 * Dense instanced tumor cells advected along a vessel curve.
 * Procedural look: emissive spheres with a cheap Fresnel rim via onBeforeCompile.
 */
export function InstancedTumorCells({
  curve,
  count,
  reducedMotion,
  intensity,
  onArrive,
  sentinelU = 0.55,
}: Props) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const offsets = useMemo(() => {
    const arr = new Float32Array(count)
    for (let i = 0; i < count; i++) arr[i] = Math.random()
    return arr
  }, [count])
  const speeds = useMemo(() => {
    const arr = new Float32Array(count)
    for (let i = 0; i < count; i++) arr[i] = 0.06 + Math.random() * 0.08
    return arr
  }, [count])
  const scales = useMemo(() => {
    const arr = new Float32Array(count)
    for (let i = 0; i < count; i++) arr[i] = 0.018 + Math.random() * 0.028
    return arr
  }, [count])

  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.tumorCell,
      emissive: COLORS.tumorGlow,
      emissiveIntensity: 1.1,
      roughness: 0.35,
      metalness: 0.05,
      toneMapped: false,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    })
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <output_fragment>',
        `#include <output_fragment>
        float ndv = saturate(dot(normalize(vNormal), normalize(vViewPosition)));
        float fres = pow(1.0 - ndv, 2.2);
        gl_FragColor.rgb += vec3(1.0, 0.45, 0.35) * fres * 0.85;
        `,
      )
    }
    mat.customProgramCacheKey = () => 'tumor-cell-fresnel-v1'
    return mat
  }, [])

  const geo = useMemo(() => new THREE.SphereGeometry(1, 8, 8), [])
  const arriveAcc = useRef(0)

  useFrame(({ clock }, dt) => {
    const inst = mesh.current
    if (!inst) return
    const visible = intensity > 0.02
    inst.visible = visible
    if (!visible) return

    const t = clock.getElapsedTime()
    let arrivals = 0
    for (let i = 0; i < count; i++) {
      let u: number
      if (reducedMotion) {
        u = (i + 0.5) / count
      } else {
        u = (offsets[i]! + t * speeds[i]!) % 1
      }
      const p = curve.getPointAt(u)
      // Mild noise displacement off the tube centerline
      const n = 0.012 * Math.sin(t * 2.1 + i * 1.7)
      dummy.position.set(p.x + n, p.y + n * 0.6, p.z - n * 0.4)
      const s = scales[i]! * (0.65 + 0.55 * intensity)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)
      if (!reducedMotion && Math.abs(u - sentinelU) < 0.02) arrivals++
    }
    inst.instanceMatrix.needsUpdate = true
    inst.material = material
    if (material.opacity !== undefined) {
      material.opacity = 0.35 + 0.65 * intensity
      material.emissiveIntensity = 0.6 + 0.9 * intensity
    }

    if (onArrive && arrivals > 0) {
      arriveAcc.current = Math.min(1, arriveAcc.current + arrivals * dt * 0.35)
      onArrive(arriveAcc.current)
    } else if (onArrive) {
      arriveAcc.current = Math.max(0, arriveAcc.current - dt * 0.25)
      onArrive(arriveAcc.current)
    }
  })

  return (
    <instancedMesh
      ref={mesh}
      args={[geo, material, count]}
      frustumCulled={false}
      renderOrder={14}
    />
  )
}
