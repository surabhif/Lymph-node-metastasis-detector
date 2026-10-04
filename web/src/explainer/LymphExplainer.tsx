import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { EXPLAINER_SOURCES, EXPLAINER_STEPS } from './steps'
import ExplainerFallback from './ExplainerFallback'
import './explainer.css'

const ExplainerCanvas = lazy(() => import('./ExplainerCanvas'))

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function useMediaFlag(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export default function LymphExplainer() {
  const [stepIndex, setStepIndex] = useState(0)
  const [activeNode, setActiveNode] = useState<string | null>(null)
  const [webgl, setWebgl] = useState(true)
  const [forceStatic, setForceStatic] = useState(false)
  const headingId = useId()
  const panelId = useId()

  const reducedMotion = useMediaFlag('(prefers-reduced-motion: reduce)')
  const isMobile = useMediaFlag('(max-width: 720px)')
  const step = EXPLAINER_STEPS[stepIndex]
  const quality = isMobile ? 'low' : 'high'
  const use3d = webgl && !forceStatic && !reducedMotion

  useEffect(() => {
    setWebgl(detectWebGL())
  }, [])

  useEffect(() => {
    setActiveNode(null)
  }, [stepIndex])

  const go = useCallback(
    (next: number) => {
      setStepIndex(Math.max(0, Math.min(EXPLAINER_STEPS.length - 1, next)))
    },
    [],
  )

  const onKeyNav = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      go(stepIndex + 1)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      go(stepIndex - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      go(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      go(EXPLAINER_STEPS.length - 1)
    }
  }

  const progressLabel = useMemo(
    () => `Step ${stepIndex + 1} of ${EXPLAINER_STEPS.length}`,
    [stepIndex],
  )

  return (
    <section className="explainer" aria-labelledby={headingId}>
      <div className="explainer-top">
        <div className="explainer-copy">
          <p className="hero-eyebrow">Interactive explainer · research education</p>
          <h1 id={headingId} className="hero-brand">
            Lymph Node Metastasis Detector
          </h1>
          <p className="hero-lede">
            A short guided tour of why axillary lymph nodes matter in breast cancer — then try the
            in-browser detector on public PatchCamelyon patches.
          </p>
          <div className="hero-actions">
            <Link className="btn" to="/demo">
              Try the detector
            </Link>
            <a className="btn secondary" href="#explainer-stages">
              Start the tour
            </a>
          </div>
          <p className="hero-note">Educational visuals only · not medical advice · not for clinical use</p>
        </div>
      </div>

      <div
        id="explainer-stages"
        className="explainer-stage-shell"
        tabIndex={0}
        onKeyDown={onKeyNav}
        aria-describedby={panelId}
      >
        <div className="explainer-toolbar" role="toolbar" aria-label="Explainer steps">
          <div className="explainer-step-tabs" role="tablist" aria-label="Explainer chapters">
            {EXPLAINER_STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === stepIndex}
                aria-controls={panelId}
                className={i === stepIndex ? 'step-tab active' : 'step-tab'}
                onClick={() => go(i)}
              >
                <span className="step-tab-num">{i + 1}</span>
                <span className="step-tab-title">{s.shortTitle}</span>
              </button>
            ))}
          </div>
          <div className="explainer-step-arrows">
            <button
              type="button"
              className="btn secondary btn-compact"
              onClick={() => go(stepIndex - 1)}
              disabled={stepIndex === 0}
            >
              Previous
            </button>
            <span className="muted tiny" aria-live="polite">
              {progressLabel}
            </span>
            <button
              type="button"
              className="btn secondary btn-compact"
              onClick={() => go(stepIndex + 1)}
              disabled={stepIndex === EXPLAINER_STEPS.length - 1}
            >
              Next
            </button>
          </div>
        </div>

        <div className="explainer-grid" role="tabpanel" id={panelId} aria-label={step.title}>
          <div className="explainer-viewport panel">
            {use3d ? (
              <Suspense
                fallback={
                  <div className="explainer-loading" role="status">
                    Loading 3D scene…
                  </div>
                }
              >
                <ExplainerCanvas
                  stepId={step.id}
                  quality={quality}
                  reducedMotion={reducedMotion}
                  activeNode={activeNode}
                  onActiveNode={setActiveNode}
                />
              </Suspense>
            ) : (
              <ExplainerFallback step={step} />
            )}
            {use3d && (
              <div className="scene-legend" aria-hidden="true">
                <p className="scene-legend-title">Legend</p>
                {step.id === 'lymphatic' && (
                  <>
                    <div className="scene-legend-row">
                      <span className="scene-swatch tumor" /> Breast tumor
                    </div>
                    <div className="scene-legend-row">
                      <span className="scene-swatch vessel" /> Lymph vessel
                    </div>
                    <div className="scene-legend-row">
                      <span className="scene-swatch sentinel" /> Sentinel node
                    </div>
                    <div className="scene-legend-row">
                      <span className="scene-swatch node" /> Further axillary nodes
                    </div>
                    {activeNode && (
                      <div className="scene-legend-row">
                        Focused: {activeNode === 'sentinel' ? 'sentinel' : 'further node'}
                      </div>
                    )}
                  </>
                )}
                {step.id === 'spread' && (
                  <>
                    <div className="scene-legend-row">
                      <span className="scene-swatch tumor" /> Tumor cells
                    </div>
                    <div className="scene-legend-row">
                      <span className="scene-swatch vessel" /> Travel path
                    </div>
                    <div className="scene-legend-row">
                      <span className="scene-swatch sentinel" /> Sentinel first
                    </div>
                    <div className="scene-legend-row">
                      <span className="scene-swatch node" /> Further nodes
                    </div>
                  </>
                )}
                {step.id === 'inside' && (
                  <>
                    <div className="scene-legend-row">
                      <span className="scene-swatch itc" /> ITC ≤ 0.2 mm
                    </div>
                    <div className="scene-legend-row">
                      <span className="scene-swatch micro" /> Micro ≤ 2 mm
                    </div>
                    <div className="scene-legend-row">
                      <span className="scene-swatch macro" /> Macro &gt; 2 mm
                    </div>
                  </>
                )}
                {step.id === 'surgery' && (
                  <>
                    <div className="scene-legend-row">Left: sentinel biopsy</div>
                    <div className="scene-legend-row">Right: axillary dissection</div>
                    <div className="scene-legend-row tnm-chip">
                      Staging: T · <strong>N</strong> · M
                    </div>
                  </>
                )}
                {step.id === 'patches' && (
                  <>
                    <div className="scene-legend-row">Whole-slide tiled grid</div>
                    <div className="scene-legend-row">
                      <span className="scene-swatch patch" /> One 96×96 patch → detector
                    </div>
                  </>
                )}
              </div>
            )}
            <p className="sr-only">{step.alt}</p>
            <div className="explainer-viewport-hint muted tiny">
              {use3d
                ? 'Drag to rotate · scroll to zoom · Tab to step controls · arrow keys change steps'
                : reducedMotion
                  ? 'Motion reduced — showing a static illustration'
                  : '3D unavailable — showing a static illustration'}
              {webgl && !reducedMotion && (
                <>
                  {' · '}
                  <button type="button" className="text-button" onClick={() => setForceStatic((v) => !v)}>
                    {forceStatic ? 'Use 3D view' : 'Use static view'}
                  </button>
                </>
              )}
            </div>
          </div>

          <aside className="explainer-sidebar panel">
            <p className="explainer-kicker">{step.kicker}</p>
            <h2 className="explainer-step-title">{step.title}</h2>
            <p>{step.body}</p>
            {step.callouts && (
              <ul className="explainer-callouts">
                {step.callouts.map((c) => (
                  <li key={c.label}>
                    <strong>{c.label}</strong>
                    <span>{c.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {step.id === 'patches' && (
              <div className="explainer-cta-block">
                <Link className="btn" to="/demo">
                  Try the detector
                </Link>
                <p className="muted tiny">
                  Run the ONNX model on real PCam test patches and inspect the heatmap.
                </p>
              </div>
            )}
          </aside>
        </div>
      </div>

      <section className="home-strip" aria-label="Project pillars">
        <div>
          <h2>Public data</h2>
          <p>PCam (CC0) lymph-node patches from Camelyon16 — de-identified research images only.</p>
        </div>
        <div>
          <h2>Honest evaluation</h2>
          <p>
            Official splits, ROC-AUC with a confidence interval, calibration, and a failure gallery.
          </p>
        </div>
        <div>
          <h2>Private by design</h2>
          <p>ONNX Runtime Web runs on-device. Uploaded images are not sent to a server.</p>
        </div>
      </section>

      <details className="explainer-sources panel">
        <summary>Sources</summary>
        <p className="muted">
          Short references for the educational story. This page does not give medical advice.
        </p>
        <ul>
          {EXPLAINER_SOURCES.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noreferrer">
                {s.name}
              </a>
              <span className="muted"> — {s.note}</span>
            </li>
          ))}
        </ul>
        <p className="tiny muted">
          3D scenes use procedural / low-poly geometry generated in-browser (no third-party 3D
          models).
        </p>
      </details>
    </section>
  )
}
