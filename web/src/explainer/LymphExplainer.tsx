import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { EXPLAINER_SOURCES, EXPLAINER_STEPS } from './steps'
import ExplainerFallback from './ExplainerFallback'
import { detectWebGLSupport } from './gpuDetect'
import patchesMeta from './patchesMeta.json'
import type { DepositMode } from './scenes'
import { STEP_SNAP, stepIndexFromProgress } from './scrollSteps'
import './explainer.css'

const ExplainerCanvas = lazy(() => import('./ExplainerCanvas'))

type LymphExplainerProps = {
  /** When true, skip the full brand hero (landing page already has one). */
  compactIntro?: boolean
}

/** Lazy GSAP + ScrollTrigger so the scroll scrubber is not in the critical path. */
async function loadScrollTrigger() {
  const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger'),
  ])
  gsap.registerPlugin(ScrollTrigger)
  return { gsap, ScrollTrigger }
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

function SceneLegendBody({
  stepId,
  activeNode,
}: {
  stepId: (typeof EXPLAINER_STEPS)[number]['id']
  activeNode: string | null
}) {
  if (stepId === 'lymphatic') {
    return (
      <>
        <div className="scene-legend-row">
          <span className="scene-swatch tumor" /> Breast tumor
        </div>
        <div className="scene-legend-row">
          <span className="scene-swatch vessel" /> Lymph vessel
        </div>
        <div className="scene-legend-row">
          <span className="scene-swatch sentinel" /> Sentinel (level I)
        </div>
        <div className="scene-legend-row">
          <span className="scene-swatch node" /> Levels II–III
        </div>
        {activeNode && (
          <div className="scene-legend-row">
            Focused:{' '}
            {activeNode === 'sentinel'
              ? 'sentinel / level I'
              : activeNode === 'level2'
                ? 'level II'
                : 'level III'}
          </div>
        )}
      </>
    )
  }
  if (stepId === 'spread') {
    return (
      <>
        <div className="scene-legend-row">
          <span className="scene-swatch tumor-cell" /> Tumor cells
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
    )
  }
  if (stepId === 'inside') {
    return (
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
        <div className="scene-legend-row">
          <span className="scene-swatch lymphoid" /> Healthy lymphoid tissue
        </div>
      </>
    )
  }
  if (stepId === 'surgery') {
    return (
      <>
        <div className="scene-legend-row">
          <span className="scene-swatch sentinel" /> SLNB: 1–3 nodes
        </div>
        <div className="scene-legend-row">
          <span className="scene-swatch node" /> ALND: levels I–II
        </div>
        <div className="scene-legend-row tnm-chip">
          Staging: T · <strong>N</strong> · M
        </div>
      </>
    )
  }
  return (
    <>
      <div className="scene-legend-row muted">Real PCam H&amp;E mosaic (WSI stand-in)</div>
      <div className="scene-legend-row">
        <span className="scene-swatch tumor soft-tint" /> Tumor-labeled tile (frame)
      </div>
      <div className="scene-legend-row">
        <span className="scene-swatch tumor" /> Highlighted 96×96 tumor patch
      </div>
      <div className="scene-legend-row muted">Label if center 32×32 has tumor</div>
    </>
  )
}

export default function LymphExplainer({ compactIntro = false }: LymphExplainerProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [activeNode, setActiveNode] = useState<string | null>(null)
  const [webgl, setWebgl] = useState(true)
  const [forceStatic, setForceStatic] = useState(false)
  const [legendOpen, setLegendOpen] = useState(true)
  const [surgeryPanel, setSurgeryPanel] = useState<'slnb' | 'alnd'>('slnb')
  const [depositMode, setDepositMode] = useState<DepositMode>('all')
  const headingId = useId()
  const panelId = useId()
  const trackRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  // ScrollTrigger instance (loaded async with GSAP)
  const triggerRef = useRef<{
    start: number
    end: number
    progress: number
    scroll: (y: number) => void
    kill: () => void
  } | null>(null)
  const scrollingToRef = useRef(false)
  const progressRef = useRef(0)
  const gsapRef = useRef<typeof import('gsap').default | null>(null)
  const tweenRef = useRef<{ kill: () => void } | null>(null)
  /** Bumps on every pill / Prev-Next flight so only the latest tween / rAF stays live. */
  const flightGenRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  const reducedMotion = useMediaFlag('(prefers-reduced-motion: reduce)')
  const [motionOptIn, setMotionOptIn] = useState(false)
  const isMobile = useMediaFlag('(max-width: 720px)')
  const step = EXPLAINER_STEPS[stepIndex]
  const quality = isMobile ? 'low' : 'high'
  // Reduced motion: static by default; visitor can opt into 3D explicitly.
  const use3d = webgl && !forceStatic && (!reducedMotion || motionOptIn)
  const scrollDriven = use3d && !reducedMotion
  const surgeryMode = step.id === 'surgery' ? (isMobile ? surgeryPanel : 'both') : 'both'

  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  useEffect(() => {
    setWebgl(detectWebGLSupport())
  }, [])

  useEffect(() => {
    setActiveNode(null)
    if (EXPLAINER_STEPS[stepIndex]?.id === 'surgery') setSurgeryPanel('slnb')
    if (EXPLAINER_STEPS[stepIndex]?.id === 'inside') setDepositMode('all')
    if (EXPLAINER_STEPS[stepIndex]?.id === 'patches') setLegendOpen(false)
  }, [stepIndex])

  useEffect(() => {
    setLegendOpen(!isMobile)
  }, [isMobile])

  // Capture / QA helper: hold an exact scrub without GSAP snap fighting mid-frames.
  useEffect(() => {
    const w = window as Window & {
      __setExplainerProgress?: (p: number, holdMs?: number) => void
      __releaseExplainerScroll?: () => void
      __explainerHoldGen?: number
    }
    w.__setExplainerProgress = (p: number, holdMs = 4000) => {
      const clamped = Math.min(1, Math.max(0, p))
      const gen = (w.__explainerHoldGen = (w.__explainerHoldGen ?? 0) + 1)
      scrollingToRef.current = true
      tweenRef.current?.kill()
      progressRef.current = clamped
      setProgress(clamped)
      setStepIndex(stepIndexFromProgress(clamped))
      if (holdMs <= 0) {
        scrollingToRef.current = false
        return
      }
      window.setTimeout(() => {
        // Only the latest hold may clear the lock (overlapping holds raced before).
        if (w.__explainerHoldGen === gen) scrollingToRef.current = false
      }, holdMs)
    }
    w.__releaseExplainerScroll = () => {
      w.__explainerHoldGen = (w.__explainerHoldGen ?? 0) + 1
      scrollingToRef.current = false
    }
    return () => {
      delete w.__setExplainerProgress
      delete w.__releaseExplainerScroll
    }
  }, [])

  // Expose pill helper after scrollToStep exists (see below).

  // GSAP ScrollTrigger: scrub progress from the tall track. Use CSS sticky
  // instead of ScrollTrigger pin — pin's position:fixed reparents the WebGL
  // canvas and freezes R3F scene updates under SwiftShader.
  useEffect(() => {
    if (!scrollDriven || !trackRef.current) {
      triggerRef.current = null
      return
    }

    let cancelled = false
    let cleanup: (() => void) | undefined

    void loadScrollTrigger().then(({ gsap, ScrollTrigger }) => {
      if (cancelled || !trackRef.current) return
      gsapRef.current = gsap
      const ctx = gsap.context(() => {
        const st = ScrollTrigger.create({
          trigger: trackRef.current,
          start: 'top top',
          end: 'bottom bottom',
          // Tighter scrub so continuous blends track the wheel / snap ease
          scrub: isMobile ? 0.55 : 0.28,
          invalidateOnRefresh: true,
          snap: {
            snapTo: (value: number) => {
              // Freeze snap while pills / programmatic flights own the scrub.
              if (scrollingToRef.current) return value
              let best: number = STEP_SNAP[0]!
              let bestDist = Infinity
              for (const s of STEP_SNAP) {
                const d = Math.abs(value - s)
                if (d < bestDist) {
                  bestDist = d
                  best = s
                }
              }
              return best
            },
            // Ease through the transition (~0.9–1.2s) instead of a hard cut
            duration: { min: 0.9, max: 1.2 },
            ease: 'power2.inOut',
            delay: 0.04,
          },
          onUpdate: (self: { progress: number }) => {
            if (scrollingToRef.current) return
            const p = self.progress
            setProgress(p)
            const idx = stepIndexFromProgress(p)
            setStepIndex((prev) => (prev === idx ? prev : idx))
          },
        })
        triggerRef.current = st
      })
      cleanup = () => {
        triggerRef.current = null
        ctx.revert()
      }
    })

    return () => {
      cancelled = true
      tweenRef.current?.kill()
      cleanup?.()
      triggerRef.current = null
    }
  }, [scrollDriven, isMobile])

  const stepIndexRef = useRef(stepIndex)
  useEffect(() => {
    stepIndexRef.current = stepIndex
  }, [stepIndex])

  const scrollToStep = useCallback((index: number) => {
    const next = Math.max(0, Math.min(EXPLAINER_STEPS.length - 1, index))
    const target = STEP_SNAP[next] ?? 0
    const from = progressRef.current

    // Kill any in-flight pill tween / rAF so rapid clicks never stack scenes.
    flightGenRef.current += 1
    const gen = flightGenRef.current
    tweenRef.current?.kill()
    tweenRef.current = null
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    scrollingToRef.current = true

    /** Animate React progress only — avoid ScrollTrigger.scroll mid-flight (bounds/snap fight). */
    const applyProgress = (p: number, landIndex?: number) => {
      if (flightGenRef.current !== gen) return
      const clamped = Math.min(1, Math.max(0, p))
      progressRef.current = clamped
      setProgress(clamped)
      setStepIndex(landIndex ?? stepIndexFromProgress(clamped))
    }

    const syncScrollToProgress = (p: number) => {
      const st = triggerRef.current
      if (!st) return
      const y = st.start + (st.end - st.start) * p
      window.scrollTo(0, y)
      st.scroll(y)
    }

    const finish = () => {
      if (flightGenRef.current !== gen) return
      applyProgress(target, next)
      syncScrollToProgress(target)
      // Hold the lock so ScrollTrigger snap/scrub cannot yank off the landing.
      window.setTimeout(() => {
        if (flightGenRef.current === gen) {
          syncScrollToProgress(target)
          scrollingToRef.current = false
        }
      }, 400)
      tweenRef.current = null
      rafRef.current = null
    }

    if (reducedMotion || Math.abs(target - from) < 0.001) {
      applyProgress(target, next)
      syncScrollToProgress(target)
      window.setTimeout(() => {
        if (flightGenRef.current === gen) scrollingToRef.current = false
      }, 400)
      return
    }

    const stepSpan = Math.max(1, Math.round(Math.abs(next - stepIndexRef.current) || 1))
    const dur = Math.min(1.15, Math.max(0.95, 0.95 + (stepSpan - 1) * 0.12))

    // Prefer rAF for progress so GSAP ScrollTrigger snap cannot overwrite the proxy tween.
    const t0 = performance.now()
    const ms = dur * 1000
    const tick = (now: number) => {
      if (flightGenRef.current !== gen) return
      const t = Math.min(1, (now - t0) / ms)
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
      applyProgress(from + (target - from) * e)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        finish()
      }
    }
    rafRef.current = requestAnimationFrame(tick)
  }, [scrollDriven, reducedMotion])

  const go = useCallback(
    (next: number) => {
      scrollToStep(next)
    },
    [scrollToStep],
  )

  useEffect(() => {
    const w = window as Window & { __scrollToExplainerStep?: (index: number) => void }
    w.__scrollToExplainerStep = (index: number) => scrollToStep(index)
    return () => {
      delete w.__scrollToExplainerStep
    }
  }, [scrollToStep])

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
          {compactIntro ? (
            <>
              <p className="hero-eyebrow">Interactive 3D explainer</p>
              <h2 id={headingId} className="explainer-section-title">
                Five scenes · scroll or step through
              </h2>
              <p className="hero-lede">
                Lymphatics, spread, deposit sizes, surgery choices, and how whole-slide images become
                96×96 patches — then try the detector.
              </p>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>

      <div
        id="explainer-stages"
        ref={trackRef}
        className={`explainer-scroll-track${scrollDriven ? ' scroll-driven' : ''}`}
      >
        <div
          ref={pinRef}
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
          <div
            className={`explainer-viewport panel cinematic${
              step.id === 'patches' && progress >= 0.9 ? ' light-panel' : ''
            }`}
            data-progress={progress.toFixed(3)}
            data-step={step.id}
          >
            <div className={`explainer-canvas-host${use3d ? ' ready-3d' : ''}`}>
              {use3d ? (
                <Suspense
                  fallback={
                    <div className="explainer-loading explainer-poster" role="status">
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
                    surgeryMode={surgeryMode}
                    depositMode={depositMode}
                    progress={progress}
                    scrollDriven={scrollDriven}
                  />
                </Suspense>
              ) : (
                <ExplainerFallback step={step} />
              )}
              {use3d && step.id === 'surgery' && (
                <div className={`surgery-panel-overlay${isMobile ? ' mobile' : ''}`}>
                  {!isMobile && <div className="surgery-divider" aria-hidden="true" />}
                  {isMobile ? (
                    <div className="surgery-toggle" role="tablist" aria-label="Surgery comparison">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={surgeryPanel === 'slnb'}
                        className={surgeryPanel === 'slnb' ? 'active' : ''}
                        onClick={() => setSurgeryPanel('slnb')}
                      >
                        Sentinel node biopsy
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={surgeryPanel === 'alnd'}
                        className={surgeryPanel === 'alnd' ? 'active' : ''}
                        onClick={() => setSurgeryPanel('alnd')}
                      >
                        Axillary dissection
                      </button>
                    </div>
                  ) : (
                    <div className="surgery-captions">
                      <span>Sentinel node biopsy</span>
                      <span>Axillary dissection</span>
                    </div>
                  )}
                </div>
              )}
              {use3d && step.id === 'inside' && (
                <div className="node-deposit-bar" role="toolbar" aria-label="Deposit size focus">
                  {(
                    [
                      ['all', 'All'],
                      ['itc', 'ITC'],
                      ['micro', 'Micro'],
                      ['macro', 'Macro'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={depositMode === id ? 'active' : ''}
                      aria-pressed={depositMode === id}
                      onClick={() => setDepositMode(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {use3d && step.id === 'inside' && (
                <div className="node-scale-cue" aria-hidden="true">
                  <span className="cue itc" />
                  <span className="cue micro" />
                  <span className="cue macro" />
                  <em>Relative size</em>
                </div>
              )}
              <p className="sr-only">{step.alt}</p>
              {step.id !== 'patches' && (
                <div className="explainer-viewport-hint muted tiny">
                  {use3d
                    ? scrollDriven
                      ? 'Scroll to travel · drag to glance · Tab to step controls · arrow keys snap steps'
                      : 'Drag to rotate · scroll to zoom · Tab to step controls · arrow keys change steps'
                    : reducedMotion && !motionOptIn
                      ? 'Motion reduced — showing a static illustration'
                      : '3D unavailable — showing a static illustration'}
                  {webgl && reducedMotion && (
                    <>
                      {' · '}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setMotionOptIn((v) => !v)}
                      >
                        {motionOptIn ? 'Use static view' : 'Play 3D'}
                      </button>
                    </>
                  )}
                  {webgl && !reducedMotion && (
                    <>
                      {' · '}
                      <button type="button" className="text-button" onClick={() => setForceStatic((v) => !v)}>
                        {forceStatic ? 'Use 3D view' : 'Use static view'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {step.id === 'patches' && (
              <p className="patch-mosaic-caption under-canvas">{patchesMeta.label}</p>
            )}
            {use3d && (
              <div className={`scene-legend-wrap${legendOpen ? ' open' : ''}`}>
                <button
                  type="button"
                  className="legend-toggle"
                  aria-expanded={legendOpen}
                  onClick={() => setLegendOpen((v) => !v)}
                >
                  Legend
                </button>
                {legendOpen && (
                  <div className="scene-legend" aria-hidden="true">
                    <SceneLegendBody stepId={step.id} activeNode={activeNode} />
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="explainer-sidebar panel">
            <p className="explainer-kicker">{step.kicker}</p>
            <h2 className="explainer-step-title">{step.title}</h2>
            <p>{step.body}</p>
            {step.id === 'patches' && (
              <div className="explainer-cta-block">
                <p className="patch-rule-note">
                  PCam labeling rule: a patch is labeled <strong>tumor</strong> if the{' '}
                  <strong>center 32×32</strong> region contains tumor tissue.
                </p>
                <Link className="btn" to={`/demo?sample=${patchesMeta.hotTile.galleryId}`}>
                  Open this patch in the demo
                </Link>
                <p className="muted tiny">
                  Preloads the same highlighted 96×96 test patch (index 2883, CC0) and runs the
                  ONNX model in your browser.
                </p>
              </div>
            )}
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
          </aside>
        </div>
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
          Primary meshes are NIH/HuBMAP Human Reference Atlas female skin, right mammary gland,
          and lymph-node reference geometry (CC BY 4.0). BodyParts3D (CC BY 4.0) is credited in
          Sources / <code>THIRD_PARTY_NOTICES.md</code> but pec/chest fragments are omitted — they
          misaligned under glass and read as dark mid-chest smudges. Axillary vessels/nodes are
          educational overlays. Step 3 uses a clean cut-away schematic (HRA-inspired) so deposit
          sizes stay readable. If a mesh fails to load, a procedural fallback is used. Step 5 uses a
          mosaic of real PCam (CC0) test patches as an honest WSI stand-in — not contiguous tissue.
        </p>
      </details>
    </section>
  )
}
