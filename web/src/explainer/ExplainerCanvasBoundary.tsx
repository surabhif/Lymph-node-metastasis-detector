import { Component, type ErrorInfo, type ReactNode } from 'react'
import { EXPLAINER_STEPS, type ExplainerStepId } from './steps'
import ExplainerFallback from './ExplainerFallback'

type Props = {
  stepId: ExplainerStepId
  children: ReactNode
  /** Called when the boundary catches so the parent can drop the 3D path. */
  onError?: (error: Error) => void
}

type State = { error: Error | null }

/**
 * Catches R3F / WebGL render errors so a canvas failure falls back to the
 * static explainer instead of blanking the entire React tree.
 */
export class ExplainerCanvasBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[explainer] 3D canvas error — falling back to static view', error, info.componentStack)
    this.props.onError?.(error)
  }

  render() {
    if (this.state.error) {
      const step = EXPLAINER_STEPS.find((s) => s.id === this.props.stepId) ?? EXPLAINER_STEPS[0]!
      return <ExplainerFallback step={step} />
    }
    return this.props.children
  }
}
