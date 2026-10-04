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

/**
 * Focus region: affected-side chest + shoulder + axilla + upper arm,
 * but biased toward mid-chest so the frame is not empty on the left.
 */
export function anatomyFocusBox(): THREE.Box3 {
  const b = torsoBounds
  const min = b.min
  const max = b.max
  // From just past midline toward the affected arm; keep full crop height
  return new THREE.Box3(
    new THREE.Vector3(min.x * 0.88, min.y + (max.y - min.y) * 0.05, min.z + (max.z - min.z) * 0.25),
    new THREE.Vector3(max.x * 0.35, max.y - (max.y - min.y) * 0.02, max.z),
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
  /** When true, don't let horizontal fit pull the camera so far that subjects look tiny. */
  preferHeight?: boolean
}): CameraTarget {
  const {
    box,
    aspect,
    fovDeg,
    azimuthDeg = 28,
    elevationDeg = 10,
    margin = 1.35,
    preferHeight = false,
  } = opts

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  // Keep look-at near the center of the focus box (mild axilla bias only)
  const lookAt = new THREE.Vector3(
    center.x - size.x * 0.02,
    center.y + size.y * 0.02,
    center.z + size.z * 0.06,
  )

  const vFov = THREE.MathUtils.degToRad(fovDeg)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 0.35))
  const distV = (size.y * margin) / (2 * Math.tan(vFov / 2))
  const distH = (size.x * margin) / (2 * Math.tan(hFov / 2))
  const distD = (size.z * margin * 1.15) / (2 * Math.tan(vFov / 2))
  let dist = Math.max(distV, distH, distD, 2.5)
  if (preferHeight) {
    // Prefer vertical fill for dual panels
    dist = distV * 1.0
  }

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

/** Dual-panel surgery framing: both torsos side-by-side with a clear gap. */
export function surgeryFocusBox(panelX = 1.2, panelScale = 0.58): THREE.Box3 {
  const s = panelScale
  // Same anatomy focus as step 1, per panel (affected-side torso)
  const local = anatomyFocusBox()
  const sized = new THREE.Box3(
    new THREE.Vector3(local.min.x * s, local.min.y * s, local.min.z * s),
    new THREE.Vector3(local.max.x * s, local.max.y * s, local.max.z * s),
  )
  const left = sized.clone()
  left.min.x -= panelX
  left.max.x -= panelX
  const right = sized.clone()
  right.min.x += panelX
  right.max.x += panelX
  return left.union(right)
}

export function cameraTargetFor(
  stepId: ExplainerStepId,
  mobile = false,
  aspect = mobile ? 390 / 360 : 800 / 576,
  /** Mobile surgery toggle: frame a single torso like step 1. */
  surgerySingle = false,
): CameraTarget {
  const fov = mobile ? 40 : 38
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
    if (mobile || surgerySingle) {
      // Same framing as step 1 for a single torso panel
      return fitThreeQuarterCamera({
        box: anatomyFocusBox(),
        aspect,
        fovDeg: fov,
        azimuthDeg: mobile ? 25 : 27,
        elevationDeg: mobile ? 9 : 10,
        margin: mobile ? 1.42 : 1.28,
      })
    }
    // Desktop: pull back so BOTH torsos fit fully in frame with margin
    return fitThreeQuarterCamera({
      box: surgeryFocusBox(),
      aspect,
      fovDeg: fov,
      azimuthDeg: 27,
      elevationDeg: 10,
      margin: 1.38,
      preferHeight: false,
    })
  }
  return fitThreeQuarterCamera({
    box: anatomyFocusBox(),
    aspect,
    fovDeg: fov,
    azimuthDeg: mobile ? 25 : 27,
    elevationDeg: mobile ? 9 : 10,
    margin: mobile ? 1.42 : 1.28,
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
