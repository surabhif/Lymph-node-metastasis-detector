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
 * Narrower per-panel focus for dual surgery views: shoulders → below breast,
 * ipsilateral chest + axilla only. Keeps the union box from going ultra-wide
 * so the camera can match step-1 vertical fill with a clear center gap.
 */
export function surgeryPanelFocusBox(): THREE.Box3 {
  const b = torsoBounds
  const min = b.min
  const max = b.max
  const h = max.y - min.y
  const d = max.z - min.z
  return new THREE.Box3(
    new THREE.Vector3(min.x * 0.9, min.y + h * 0.1, min.z + d * 0.38),
    new THREE.Vector3(max.x * 0.08, max.y - h * 0.03, max.z),
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
    // Prefer vertical fill, but never ignore a wider dual-panel footprint
    dist = Math.max(distV, distH * 0.92)
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

/** Dual-panel surgery layout defaults — keep in sync with SurgeryScene. */
export const SURGERY_PANEL_X = 1.28
export const SURGERY_PANEL_SCALE = 0.78

/**
 * Step 3 cut-away node AABB (capsule + afferent/efferent stubs).
 * Fitted with ≥8% margin on the limiting axis.
 */
export function insideNodeFocusBox(): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(-1.55, -1.12, -0.35),
    new THREE.Vector3(1.55, 1.05, 0.55),
  )
}

/** Frontal camera for the lymph-node cut-away — ≥8% margin each side. */
export function insideNodeCameraTarget(
  aspect: number,
  fovDeg: number,
  mobile = false,
): CameraTarget {
  const box = insideNodeFocusBox()
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  // 1.19 ≈ 8% margin each side; mobile adds slack for deposit bar + scale cue
  const margin = mobile ? 1.34 : 1.19
  const vFov = THREE.MathUtils.degToRad(fovDeg)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 0.35))
  const dist = Math.max(
    (size.y * margin) / (2 * Math.tan(vFov / 2)),
    (size.x * margin) / (2 * Math.tan(hFov / 2)),
    3.2,
  )
  // Mobile: bias look-at up so the node sits above bottom UI chrome
  const lookY = center.y + (mobile ? 0.14 : 0.02)
  return {
    position: [center.x * 0.15, lookY + 0.08, center.z + dist],
    lookAt: [center.x * 0.1, lookY, center.z],
  }
}

/**
 * Step-5 mosaic layout — keep in sync with PatchesScene.
 * Gutter ≈ 1.2% of tile → roughly 1–2 px once the mosaic is camera-fitted.
 */
export const PATCHES_LAYOUT = {
  tile: 1,
  gutter: 0.02,
  grid: 3,
} as const

/** Axis-aligned bounds of the full 3×3 mosaic (including gutters). */
export function patchesFocusBox(): THREE.Box3 {
  const { tile, grid } = PATCHES_LAYOUT
  // Continuous mosaic footprint (seam gutters are drawn on the plane, not outside it).
  const span = grid * tile
  const half = span / 2
  return new THREE.Box3(
    new THREE.Vector3(-half, -half, -0.02),
    new THREE.Vector3(half, half, 0.08),
  )
}

/** Frontal camera for the patches mosaic — ≥8% margin on the limiting axis. */
export function patchesCameraTarget(
  aspect: number,
  fovDeg: number,
  mobile = false,
): CameraTarget {
  const box = patchesFocusBox()
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  // 1.38 ≈ 14% total slack → ≥8% each side after accounting for UI chrome
  const margin = mobile ? 1.62 : 1.52
  const vFov = THREE.MathUtils.degToRad(fovDeg)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 0.35))
  const dist = Math.max(
    (size.y * margin) / (2 * Math.tan(vFov / 2)),
    (size.x * margin) / (2 * Math.tan(hFov / 2)),
    3.5,
  )
  return {
    position: [center.x, center.y, center.z + dist],
    lookAt: [center.x, center.y, center.z],
  }
}

/** Dual-panel surgery framing: both panels side-by-side with a clear center gap. */
export function surgeryFocusBox(
  panelX = SURGERY_PANEL_X,
  panelScale = SURGERY_PANEL_SCALE,
): THREE.Box3 {
  const s = panelScale
  // Fit the visible focus (shoulders→breast), but pad to the full torso lateral
  // extent so deltoids/arms don't overflow the panel edges.
  const focus = surgeryPanelFocusBox()
  const full = torsoBounds
  const sized = new THREE.Box3(
    new THREE.Vector3(
      Math.min(focus.min.x, full.min.x * 0.72) * s,
      focus.min.y * s,
      focus.min.z * s,
    ),
    new THREE.Vector3(
      Math.max(focus.max.x, full.max.x * 0.15) * s,
      focus.max.y * s,
      Math.max(focus.max.z, full.max.z) * s,
    ),
  )
  // Pad for local three-quarter yaw which widens screen footprint
  const padX = (sized.max.x - sized.min.x) * 0.14
  const padZ = (sized.max.z - sized.min.z) * 0.22
  sized.min.x -= padX
  sized.max.x += padX
  sized.min.z -= padZ
  sized.max.z += padZ

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
    return insideNodeCameraTarget(aspect, fov, mobile)
  }
  if (stepId === 'patches') {
    // Straight-on fit of the full 3×3 with ≥8% margin (no three-quarter bias).
    return patchesCameraTarget(aspect, fov, mobile)
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
        margin: mobile ? 1.42 : 1.35,
      })
    }
    // Desktop: fit both panels; look at the gap center so halves read clearly
    const box = surgeryFocusBox()
    const cfg = fitThreeQuarterCamera({
      box,
      aspect,
      fovDeg: fov,
      azimuthDeg: 20,
      elevationDeg: 8,
      margin: 1.4,
      preferHeight: true,
    })
    const centerY = (box.min.y + box.max.y) * 0.5
    cfg.lookAt = [0, centerY + 0.02, 0.02]
    const dist = Math.hypot(
      cfg.position[0] - cfg.lookAt[0],
      cfg.position[1] - cfg.lookAt[1],
      cfg.position[2] - cfg.lookAt[2],
    )
    const az = THREE.MathUtils.degToRad(20)
    const el = THREE.MathUtils.degToRad(8)
    const cosEl = Math.cos(el)
    cfg.position = [
      cfg.lookAt[0] - Math.sin(az) * cosEl * dist,
      cfg.lookAt[1] + Math.sin(el) * dist,
      cfg.lookAt[2] + Math.cos(az) * cosEl * dist,
    ]
    return cfg
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
