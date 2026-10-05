import * as THREE from 'three'
import { landmark } from './AnatomyTorso'
import { cameraTargetFor, type CameraTarget } from './cameraFit'
import { EXPLAINER_STEPS } from './steps'
import { STEP_SNAP } from './scrollSteps'

export {
  STEP_SNAP,
  stepIndexFromProgress,
  stepIdFromProgress,
  stepWeight,
  blendBetween,
} from './scrollSteps'

export function axillaryPathCurve() {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(...landmark('tumor')),
    new THREE.Vector3(...landmark('vessel_mid1')),
    new THREE.Vector3(...landmark('vessel_mid2')),
    new THREE.Vector3(...landmark('sentinel')),
    new THREE.Vector3(...landmark('level2')),
    new THREE.Vector3(...landmark('level3')),
  ])
}

/**
 * Continuous camera + look-at paths. Keyframes reuse phase-1 framings so
 * anatomy placement stays familiar, then CatmullRom interpolates between them.
 */
export function buildCameraPaths(mobile: boolean, aspect: number) {
  const ids = EXPLAINER_STEPS.map((s) => s.id)
  const frames: CameraTarget[] = ids.map((id) =>
    cameraTargetFor(id, mobile, aspect, /* surgerySingle */ mobile || false),
  )

  // Step 1 opens three-quarter, then dollies slightly toward breast/axilla mid-segment.
  const step1Close: CameraTarget = {
    position: [
      frames[0]!.position[0] * 0.82 + landmark('tumor')[0] * 0.12,
      frames[0]!.position[1] * 0.9 + 0.05,
      frames[0]!.position[2] * 0.78,
    ],
    lookAt: [
      landmark('tumor')[0] * 0.55 + landmark('sentinel')[0] * 0.45,
      landmark('tumor')[1] * 0.4 + landmark('sentinel')[1] * 0.6,
      landmark('tumor')[2] * 0.5 + landmark('sentinel')[2] * 0.5,
    ],
  }

  const posPts = [
    new THREE.Vector3(...frames[0]!.position),
    new THREE.Vector3(...step1Close.position),
    new THREE.Vector3(...frames[1]!.position),
    // Mid 2→3: pull toward sentinel before diving into the node
    new THREE.Vector3(
      (frames[1]!.position[0] + frames[2]!.position[0]) * 0.5,
      (frames[1]!.position[1] + frames[2]!.position[1]) * 0.5 + 0.15,
      (frames[1]!.position[2] + frames[2]!.position[2]) * 0.42,
    ),
    new THREE.Vector3(...frames[2]!.position),
    new THREE.Vector3(...frames[3]!.position),
    new THREE.Vector3(...frames[4]!.position),
  ]
  const lookPts = [
    new THREE.Vector3(...frames[0]!.lookAt),
    new THREE.Vector3(...step1Close.lookAt),
    new THREE.Vector3(...frames[1]!.lookAt),
    new THREE.Vector3(...landmark('sentinel')),
    new THREE.Vector3(...frames[2]!.lookAt),
    new THREE.Vector3(...frames[3]!.lookAt),
    new THREE.Vector3(...frames[4]!.lookAt),
  ]

  const positionCurve = new THREE.CatmullRomCurve3(posPts)
  const lookCurve = new THREE.CatmullRomCurve3(lookPts)
  // Remap scrub t∈[0,1] so snap points land on keyframes 0,2,4,5,6.
  // Pull the 2→3 dive early enough that mid (~0.375) already frames the cut-away.
  const keyT = [0, 0.12, 0.25, 0.3, 0.4, 0.75, 1]

  return {
    sample(progress: number): CameraTarget {
      const p = THREE.MathUtils.clamp(progress, 0, 1)
      // Piecewise map scrub → curve parameter through keyT
      let i = 0
      while (i < keyT.length - 2 && p > keyT[i + 1]!) i++
      const a = keyT[i]!
      const b = keyT[i + 1]!
      const local = b === a ? 0 : (p - a) / (b - a)
      const u = (i + local) / (keyT.length - 1)
      const pos = positionCurve.getPoint(u)
      const look = lookCurve.getPoint(u)
      return {
        position: [pos.x, pos.y, pos.z],
        lookAt: [look.x, look.y, look.z],
      }
    },
  }
}

// Re-export snap length helper for callers that only need STEP_SNAP size
export const STEP_COUNT = STEP_SNAP.length
