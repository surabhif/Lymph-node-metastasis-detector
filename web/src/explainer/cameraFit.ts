import * as THREE from 'three'
import type { ExplainerStepId } from './steps'

export type CameraTarget = {
  position: [number, number, number]
  lookAt: [number, number, number]
}

/** Must match AnatomyTorso.TORSO_SCALE */
const SCALE = 5

/**
 * Scene-unit AABB of the BodyParts3D torso after TORSO_SCALE.
 * Seeded from landmarks.json bounds_m; overwritten when the GLB loads.
 */
let torsoBounds = new THREE.Box3(
  new THREE.Vector3(-1.55, -1.15, -0.9),
  new THREE.Vector3(1.55, 1.0, 0.65),
)

export function setTorsoBounds(box: THREE.Box3) {
  torsoBounds = box.clone()
}

export function getTorsoBounds() {
  return torsoBounds.clone()
}

/** Focus region: affected-side (patient-right / −X) chest, shoulder, axilla, upper arm. */
export function anatomyFocusBox(): THREE.Box3 {
  const b = torsoBounds
  const min = b.min
  const max = b.max
  return new THREE.Box3(
    new THREE.Vector3(min.x, min.y + (max.y - min.y) * 0.08, min.z + (max.z - min.z) * 0.18),
    new THREE.Vector3(max.x * 0.12, max.y - (max.y - min.y) * 0.04, max.z),
  )
}

/**
 * Gentle three-quarter camera from the affected side.
 * azimuthDeg: 0 = straight front (+Z), positive = toward −X (patient-right). Prefer 25–35.
 */
export function fitThreeQuarterCamera(opts: {
  box: THREE.Box3
  aspect: number
  fovDeg: number
  azimuthDeg?: number
  elevationDeg?: number
  margin?: number
}): CameraTarget {
  const {
    box,
    aspect,
    fovDeg,
    azimuthDeg = 30,
    elevationDeg = 11,
    margin = 1.32,
  } = opts

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const lookAt = new THREE.Vector3(
    center.x - size.x * 0.05,
    center.y + size.y * 0.03,
    center.z + size.z * 0.04,
  )

  const vFov = THREE.MathUtils.degToRad(fovDeg)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 0.35))
  const distV = (size.y * margin) / (2 * Math.tan(vFov / 2))
  const distH = (size.x * margin) / (2 * Math.tan(hFov / 2))
  const distD = (size.z * margin * 1.4) / (2 * Math.tan(vFov / 2))
  const dist = Math.max(distV, distH, distD, 2.4)

  const az = THREE.MathUtils.degToRad(azimuthDeg)
  const el = THREE.MathUtils.degToRad(elevationDeg)
  const cosEl = Math.cos(el)
  const position: [number, number, number] = [
    lookAt.x - Math.sin(az) * cosEl * dist,
    lookAt.y + Math.sin(el) * dist,
    lookAt.z + Math.cos(az) * cosEl * dist,
  ]
  return { position, lookAt: [lookAt.x, lookAt.y, lookAt.z] }
}

/** Dual-panel surgery framing: both torsos side-by-side. */
export function surgeryFocusBox(panelX = 1.55, panelScale = 0.95): THREE.Box3 {
  const s = panelScale
  const local = new THREE.Box3(
    new THREE.Vector3(torsoBounds.min.x * s, torsoBounds.min.y * s, torsoBounds.min.z * s),
    new THREE.Vector3(torsoBounds.max.x * s, torsoBounds.max.y * s, torsoBounds.max.z * s),
  )
  const left = local.clone()
  left.min.x -= panelX
  left.max.x -= panelX
  const right = local.clone()
  right.min.x += panelX
  right.max.x += panelX
  return left.union(right)
}

export function cameraTargetFor(
  stepId: ExplainerStepId,
  mobile = false,
  aspect = mobile ? 390 / 420 : 800 / 576,
): CameraTarget {
  const fov = mobile ? 42 : 40
  if (stepId === 'inside') {
    return mobile
      ? { position: [0.1, 0.22, 3.55], lookAt: [0, -0.05, 0] }
      : { position: [0.15, 0.25, 3.8], lookAt: [0, -0.05, 0] }
  }
  if (stepId === 'patches') {
    return mobile
      ? { position: [0.06, 0.2, 3.75], lookAt: [0, 0, 0] }
      : { position: [0.1, 0.28, 4.1], lookAt: [0, 0, 0] }
  }
  if (stepId === 'surgery') {
    return fitThreeQuarterCamera({
      box: surgeryFocusBox(),
      aspect,
      fovDeg: fov,
      azimuthDeg: 28,
      elevationDeg: 10,
      margin: mobile ? 1.26 : 1.18,
    })
  }
  return fitThreeQuarterCamera({
    box: anatomyFocusBox(),
    aspect,
    fovDeg: fov,
    azimuthDeg: mobile ? 28 : 30,
    elevationDeg: mobile ? 10 : 11,
    margin: mobile ? 1.4 : 1.32,
  })
}

/** Convert mesh-local (pre-scale) meters AABB into scene bounds. */
export function boundsFromMeshMeters(min: [number, number, number], max: [number, number, number]) {
  setTorsoBounds(
    new THREE.Box3(
      new THREE.Vector3(min[0] * SCALE, min[1] * SCALE, min[2] * SCALE),
      new THREE.Vector3(max[0] * SCALE, max[1] * SCALE, max[2] * SCALE),
    ),
  )
}
