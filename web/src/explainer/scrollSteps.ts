import type { ExplainerStepId } from './steps'
import { EXPLAINER_STEPS } from './steps'

/** Equal snap points for the five educational steps (0…1 scrub). */
export const STEP_SNAP = [0, 0.25, 0.5, 0.75, 1] as const

/**
 * Step index from scrub progress. Switches at the midpoint between snaps so
 * sidebar copy / pills track the same cross-fade as the 3D blend.
 */
export function stepIndexFromProgress(p: number): number {
  const clamped = Math.min(1, Math.max(0, p))
  for (let i = 0; i < STEP_SNAP.length - 1; i++) {
    const mid = (STEP_SNAP[i]! + STEP_SNAP[i + 1]!) / 2
    if (clamped < mid) return i
  }
  return STEP_SNAP.length - 1
}

export function stepIdFromProgress(p: number): ExplainerStepId {
  return EXPLAINER_STEPS[stepIndexFromProgress(p)]!.id
}

/** Local blend weight of a step around its snap (0 outside, 1 at snap). */
export function stepWeight(progress: number, stepIndex: number, halfWidth = 0.14): number {
  const t = STEP_SNAP[stepIndex] ?? 0
  const d = Math.abs(progress - t)
  if (d >= halfWidth) return 0
  return 1 - d / halfWidth
}

/** Smoothstep cross-fade from step A into B between their snaps. */
export function blendBetween(progress: number, fromIndex: number, toIndex: number): number {
  const a = STEP_SNAP[fromIndex] ?? 0
  const b = STEP_SNAP[toIndex] ?? 1
  if (b <= a) return progress >= b ? 1 : 0
  const t = Math.min(1, Math.max(0, (progress - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
