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

  // Mid 2→3: pull in on the sentinel so the clip-reveal is framed before the macro node shot.
  const sent = landmark('sentinel')
  const diveFrame: CameraTarget = {
    position: [
      sent[0] * 0.55 + frames[1]!.position[0] * 0.2,
      sent[1] * 0.35 + 0.22,
      Math.max(2.4, sent[2] + 2.85),
    ],
    lookAt: [sent[0] * 0.92, sent[1] * 0.88 + 0.04, sent[2] * 0.7],
  }
  // Mid 3→4: start the pull-back while the cut-away is still readable.
  const pullFrame: CameraTarget = {
    position: [
      frames[2]!.position[0] * 0.45 + frames[3]!.position[0] * 0.55,
      frames[2]!.position[1] * 0.4 + frames[3]!.position[1] * 0.6,
      frames[2]!.position[2] * 0.55 + frames[3]!.position[2] * 0.45,
    ],
    lookAt: [
      frames[2]!.lookAt[0] * 0.35 + frames[3]!.lookAt[0] * 0.65,
      frames[2]!.lookAt[1] * 0.4 + frames[3]!.lookAt[1] * 0.6,
      frames[2]!.lookAt[2] * 0.35 + frames[3]!.lookAt[2] * 0.65,
    ],
  }
  // Mid 4→5: hold surgery framing while mosaic rises in front.
  const mosaicApproach: CameraTarget = {
    position: [
      frames[3]!.position[0] * 0.35 + frames[4]!.position[0] * 0.65,
      frames[3]!.position[1] * 0.25 + frames[4]!.position[1] * 0.75,
      frames[3]!.position[2] * 0.3 + frames[4]!.position[2] * 0.7,
    ],
    lookAt: [
      frames[3]!.lookAt[0] * 0.25 + frames[4]!.lookAt[0] * 0.75,
      frames[3]!.lookAt[1] * 0.25 + frames[4]!.lookAt[1] * 0.75,
      frames[3]!.lookAt[2] * 0.25 + frames[4]!.lookAt[2] * 0.75,
    ],
  }

  const posPts = [
    new THREE.Vector3(...frames[0]!.position),
    new THREE.Vector3(...step1Close.position),
    new THREE.Vector3(...frames[1]!.position),
    new THREE.Vector3(...diveFrame.position),
    new THREE.Vector3(...frames[2]!.position),
    new THREE.Vector3(...pullFrame.position),
    new THREE.Vector3(...frames[3]!.position),
    new THREE.Vector3(...mosaicApproach.position),
    new THREE.Vector3(...frames[4]!.position),
  ]
  const lookPts = [
    new THREE.Vector3(...frames[0]!.lookAt),
    new THREE.Vector3(...step1Close.lookAt),
    new THREE.Vector3(...frames[1]!.lookAt),
    new THREE.Vector3(...diveFrame.lookAt),
    new THREE.Vector3(...frames[2]!.lookAt),
    new THREE.Vector3(...pullFrame.lookAt),
    new THREE.Vector3(...frames[3]!.lookAt),
    new THREE.Vector3(...mosaicApproach.lookAt),
    new THREE.Vector3(...frames[4]!.lookAt),
  ]

  const positionCurve = new THREE.CatmullRomCurve3(posPts)
  const lookCurve = new THREE.CatmullRomCurve3(lookPts)
  // Scrub snaps land on 0 / 0.25 / 0.5 / 0.75 / 1. Extra keys drive continuous blends.
  const keyT = [0, 0.12, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]

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
