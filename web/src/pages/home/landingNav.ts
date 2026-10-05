import { EXPLAINER_STEPS, type ExplainerStepId } from '../../explainer/steps'

const STEP_BY_ID: Record<ExplainerStepId, number> = {
  lymphatic: 0,
  spread: 1,
  inside: 2,
  surgery: 3,
  patches: 4,
}

declare global {
  interface Window {
    __scrollToExplainerStep?: (index: number) => void
  }
}

/** Scroll to the cinematic explainer and optionally open a step. */
export function goToExplainerStep(stepId?: ExplainerStepId) {
  const el = document.getElementById('explainer')
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  if (stepId == null) return
  const index = STEP_BY_ID[stepId]
  if (index == null) return

  const tryGo = (attempt: number) => {
    if (typeof window.__scrollToExplainerStep === 'function') {
      window.__scrollToExplainerStep(index)
      return
    }
    if (attempt < 20) window.setTimeout(() => tryGo(attempt + 1), 100)
  }
  window.setTimeout(() => tryGo(0), 350)
}

/** Handle #why / #what / #how / #explainer / #explainer-<stepId> on load and hashchange. */
export function applyLandingHash(hash: string) {
  const raw = hash.replace(/^#/, '')
  if (!raw) return

  if (raw === 'explainer' || raw === 'explainer-stages') {
    goToExplainerStep()
    return
  }

  const stepMatch = raw.match(/^explainer-(lymphatic|spread|inside|surgery|patches)$/)
  if (stepMatch) {
    goToExplainerStep(stepMatch[1] as ExplainerStepId)
    return
  }

  const el = document.getElementById(raw)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export { EXPLAINER_STEPS }
