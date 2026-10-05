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

const LOOKUP = 256

/**
 * Dense instanced tumor cells advected along a vessel curve.
 * Curve samples are cached so 2k–20k instances stay cheap per frame.
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
  const lookup = useMemo(() => {
    const arr = new Float32Array(LOOKUP * 3)
    for (let i = 0; i < LOOKUP; i++) {
      const p = curve.getPointAt(i / (LOOKUP - 1))
      arr[i * 3] = p.x
      arr[i * 3 + 1] = p.y
      arr[i * 3 + 2] = p.z
    }
    return arr
  }, [curve])

  const offsets = useMemo(() => {
    const arr = new Float32Array(count)
    for (let i = 0; i < count; i++) arr[i] = Math.random()
    return arr
  }, [count])
  const speeds = useMemo(() => {
    const arr = new Float32Array(count)
    for (let i = 0; i < count; i++) arr[i] = 0.05 + Math.random() * 0.09
    return arr
  }, [count])
  const scales = useMemo(() => {
    const arr = new Float32Array(count)
    for (let i = 0; i < count; i++) arr[i] = 0.012 + Math.random() * 0.022
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
    mat.customProgramCacheKey = () => 'tumor-cell-fresnel-v2'
    return mat
  }, [])

  // Low-poly spheres — counts are high
  const geo = useMemo(() => new THREE.SphereGeometry(1, 6, 6), [])
  const arriveAcc = useRef(0)

  useFrame(({ clock }, dt) => {
    const inst = mesh.current
    if (!inst) return
    const visible = intensity > 0.02
    inst.visible = visible
    if (!visible) return

    const t = clock.getElapsedTime()
    let arrivals = 0
    const last = LOOKUP - 1
    for (let i = 0; i < count; i++) {
      let u: number
      if (reducedMotion) {
        u = (i + 0.5) / count
      } else {
        u = (offsets[i]! + t * speeds[i]!) % 1
      }
      const fi = u * last
      const i0 = Math.min(last - 1, fi | 0)
      const i1 = i0 + 1
      const f = fi - i0
      const a = i0 * 3
      const b = i1 * 3
      const x = lookup[a]! + (lookup[b]! - lookup[a]!) * f
      const y = lookup[a + 1]! + (lookup[b + 1]! - lookup[a + 1]!) * f
      const z = lookup[a + 2]! + (lookup[b + 2]! - lookup[a + 2]!) * f
      const n = 0.01 * Math.sin(t * 2.1 + i * 1.7)
      dummy.position.set(x + n, y + n * 0.6, z - n * 0.4)
      const s = scales[i]! * (0.55 + 0.65 * intensity)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      inst.setMatrixAt(i, dummy.matrix)
      if (!reducedMotion && Math.abs(u - sentinelU) < 0.018) arrivals++
    }
    inst.instanceMatrix.needsUpdate = true
    material.opacity = 0.3 + 0.7 * intensity
    material.emissiveIntensity = 0.55 + 1.0 * intensity

    if (onArrive && arrivals > 0) {
      arriveAcc.current = Math.min(1, arriveAcc.current + arrivals * dt * 0.08)
      onArrive(arriveAcc.current)
    } else if (onArrive) {
      arriveAcc.current = Math.max(0, arriveAcc.current - dt * 0.22)
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
