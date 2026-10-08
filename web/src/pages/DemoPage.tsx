import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import samplesManifest from '../data/samples.json'
import { MODEL_STATUS, PATCH_SIZE } from '../lib/constants'
import {
  preloadModel,
  runInference,
  type InferenceResult,
  type LoadProgress,
} from '../lib/inference'
import { camToOverlay, probabilityMapOverlay } from '../lib/image'
import {
  loadModelManifest,
  verdictFor,
  verdictLabel,
  type ModelManifest,
} from '../lib/modelSettings'

type Sample = (typeof samplesManifest.samples)[number]

function formatPct(p: number) {
  return `${(p * 100).toFixed(1)}%`
}

export default function DemoPage() {
  const [searchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedMeta, setSelectedMeta] = useState<Sample | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InferenceResult | null>(null)
  const [opacity, setOpacity] = useState(0.45)
  const [useTta, setUseTta] = useState(false)
  const [useMacenko, setUseMacenko] = useState(false)
  const [manifest, setManifest] = useState<ModelManifest | null>(null)
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({
    status: 'idle',
    loadedBytes: 0,
    totalBytes: null,
    message: 'Model not loaded yet',
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const preloadDone = useRef(false)
  const optsRef = useRef({ tta: false, macenko: false })
  optsRef.current = { tta: useTta, macenko: useMacenko }

  // Defer ORT + model download until the visitor asks (or deep-links a sample).
  useEffect(() => {
    void loadModelManifest().then(setManifest).catch(() => setManifest(null))
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])

  useEffect(() => {
    if (!sourceUrl || !result || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      canvas.width = result.displayWidth
      canvas.height = result.displayHeight
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      let overlay = result.overlay
      if (result.mode === 'single-patch' && result.cam && result.camH && result.camW) {
        overlay = camToOverlay(
          result.cam,
          result.camH,
          result.camW,
          result.displayWidth,
          result.displayHeight,
          opacity,
        )
      } else if (result.mode === 'sliding-window' && result.patchMap) {
        overlay = probabilityMapOverlay(
          result.patchMap,
          result.displayWidth,
          result.displayHeight,
          PATCH_SIZE,
          Math.max(32, Math.floor(PATCH_SIZE / 2)),
          opacity,
        )
      }

      const overlayCanvas = document.createElement('canvas')
      overlayCanvas.width = result.displayWidth
      overlayCanvas.height = result.displayHeight
      overlayCanvas.getContext('2d')!.putImageData(overlay, 0, 0)
      ctx.drawImage(overlayCanvas, 0, 0)
    }
    img.src = sourceUrl
  }, [sourceUrl, result, opacity])

  async function analyze(src: string | File, meta?: Sample) {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      const url = typeof src === 'string' ? src : URL.createObjectURL(src)
      if (typeof src !== 'string') objectUrlRef.current = url
      setSourceUrl(url)
      setSelectedId(meta?.id ?? null)
      setSelectedMeta(meta ?? null)
      const out = await runInference(src, setLoadProgress, {
        tta: optsRef.current.tta,
        macenko: optsRef.current.macenko,
      })
      setResult(out)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Inference failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (preloadDone.current) return
    const id = searchParams.get('sample')
    if (!id) return
    const sample = samplesManifest.samples.find((s) => s.id === id)
    if (!sample) return
    preloadDone.current = true
    void analyze(`${import.meta.env.BASE_URL}${sample.src}`, sample)
  }, [searchParams])

  const progressPct =
    loadProgress.totalBytes && loadProgress.totalBytes > 0
      ? Math.min(100, Math.round((100 * loadProgress.loadedBytes) / loadProgress.totalBytes))
      : loadProgress.status === 'ready'
        ? 100
        : loadProgress.status === 'downloading'
          ? 15
          : 0

  const gt = selectedMeta?.groundTruthTumor
  const threshold = manifest?.threshold ?? 0.5
  const lo = manifest?.uncertain_lo ?? 0.35
  const hi = manifest?.uncertain_hi ?? 0.65
  const verdict = result ? verdictFor(result.probability, threshold, lo, hi) : null

  return (
    <div className="fade-in demo-page">
      <header className="page-intro">
        <h1 tabIndex={-1}>Try the detector</h1>
        <p>
          Choose a real PCam test-set patch or upload your own image. Inference runs entirely in
          your browser. Threshold and uncertain band come from the model settings file — not
          hard-coded.
        </p>
      </header>

      <div className="model-progress panel" aria-live="polite">
        <div className="model-progress-row">
          <strong>Model status</strong>
          <span className="muted">{loadProgress.message}</span>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
          aria-label="Model download progress"
        >
          <div className="progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="muted tiny">
          ONNX Runtime and the ~{MODEL_STATUS.sizeHintMb} MB model load only when you run a sample
          or click Load model. Later visits use the browser cache when available.
        </p>
        {loadProgress.status === 'idle' && (
          <p>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                void preloadModel(setLoadProgress).catch(() => undefined)
              }}
            >
              Load model now
            </button>
          </p>
        )}
      </div>

      <div className="demo-layout">
        <section className="panel">
          <h2 className="section-title">Sample gallery</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {samplesManifest.disclaimer}
          </p>
          <div className="gallery-grid">
            {samplesManifest.samples.map((sample) => (
              <button
                key={sample.id}
                type="button"
                className={`gallery-item${selectedId === sample.id ? ' selected' : ''}`}
                onClick={() => analyze(`${import.meta.env.BASE_URL}${sample.src}`, sample)}
                disabled={busy || loadProgress.status === 'error'}
                aria-pressed={selectedId === sample.id}
              >
                <img
                  src={`${import.meta.env.BASE_URL}${sample.src}`}
                  alt={
                    sample.kind === 'tile'
                      ? 'PCam stitched mosaic of H&E-stained lymph-node tissue patches'
                      : `PCam test patch ${'testIndex' in sample ? sample.testIndex : ''}, H&E-stained lymph-node tissue, ground truth ${sample.groundTruthTumor ? 'tumor' : 'normal'}`
                  }
                  width={96}
                  height={96}
                  loading="lazy"
                />
                <figcaption>
                  {sample.kind === 'tile' ? (
                    <span className="badge tile">mosaic</span>
                  ) : sample.groundTruthTumor ? (
                    <span className="badge tumor">tumor</span>
                  ) : (
                    <span className="badge normal">normal</span>
                  )}
                  {sample.kind === 'tile'
                    ? 'stitched mosaic'
                    : `test #${'testIndex' in sample ? sample.testIndex : '?'}`}
                </figcaption>
              </button>
            ))}
          </div>

          <div className="upload-row">
            <label className="btn secondary">
              Upload your own image
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                disabled={busy || loadProgress.status === 'error'}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void analyze(file)
                  e.target.value = ''
                }}
              />
            </label>
            {busy && <span className="muted">Running model…</span>}
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
        </section>

        <section className="panel">
          <h2 className="section-title">Prediction &amp; heatmap</h2>
          <div className="viewer">
            {!sourceUrl && (
              <div className="viewer-empty">
                <p>No image selected yet.</p>
                <p className="muted">
                  Click a gallery patch to compare the model score with ground truth, or upload an
                  image.
                </p>
              </div>
            )}
            {sourceUrl && <canvas ref={canvasRef} aria-label="Image with heatmap overlay" />}
          </div>

          <div className="result-row">
            <div className="gauge" aria-label="Predicted metastasis probability">
              <svg viewBox="0 0 120 70" className="gauge-svg" role="img">
                <path
                  d="M10 60 A50 50 0 0 1 110 60"
                  fill="none"
                  stroke="var(--line)"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
                <path
                  d="M10 60 A50 50 0 0 1 110 60"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${(result ? result.probability : 0) * 157} 157`}
                />
                <text x="60" y="52" textAnchor="middle" className="gauge-text">
                  {result ? formatPct(result.probability) : '—'}
                </text>
              </svg>
              <div className="gauge-label">Calibrated tumor probability</div>
              {verdict && (
                <p className={`verdict-pill verdict-${verdict}`} aria-live="polite">
                  {verdictLabel(verdict)}
                </p>
              )}
            </div>

            <div className="gt-card">
              <div className="label">Threshold bar</div>
              <div
                className="threshold-bar"
                role="img"
                aria-label={`Probability ${(result?.probability ?? 0).toFixed(2)}, uncertain band ${lo} to ${hi}, threshold ${threshold}`}
              >
                <i style={{ width: `${(result?.probability ?? 0) * 100}%` }} />
                <span
                  className="threshold-band"
                  style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }}
                />
              </div>
              <p className="tiny muted">
                0 — normal —[ uncertain ]— tumor — 1 · t*={threshold} from settings
              </p>
              <div className="label" style={{ marginTop: '0.75rem' }}>
                Ground truth
              </div>
              {selectedMeta ? (
                gt === null || gt === undefined ? (
                  <p>
                    Stitched mosaic of separate test patches — no single patch label.
                  </p>
                ) : (
                  <p>
                    <span className={`badge ${gt ? 'tumor' : 'normal'}`}>
                      {gt ? 'tumor' : 'normal'}
                    </span>{' '}
                    PCam test
                    {'testIndex' in selectedMeta && selectedMeta.testIndex != null
                      ? ` #${selectedMeta.testIndex}`
                      : ''}
                  </p>
                )
              ) : (
                <p className="muted">Available for gallery samples only.</p>
              )}
              <p className="tiny muted">
                Mode:{' '}
                {result
                  ? result.mode === 'single-patch'
                    ? 'Single-patch CAM'
                    : 'Sliding-window map'
                  : '—'}
              </p>
            </div>
          </div>

          <label className="opacity-control">
            <span>Heatmap opacity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              disabled={!result}
              aria-valuetext={`${Math.round(opacity * 100)} percent opacity`}
            />
            <span className="muted">{Math.round(opacity * 100)}%</span>
          </label>
          <p className="muted tiny heatmap-legend" aria-hidden={false}>
            Heatmap legend: cool = lower contribution · warm = higher contribution to the tumor
            score.
          </p>

          <details className="heatmap-explainer demo-options">
            <summary>Options</summary>
            <label className="demo-opt">
              <input
                type="checkbox"
                checked={useTta}
                onChange={(e) => setUseTta(e.target.checked)}
              />
              Test-time augmentation (8 flips/rotations, slower)
            </label>
            <label className="demo-opt">
              <input
                type="checkbox"
                checked={useMacenko}
                onChange={(e) => setUseMacenko(e.target.checked)}
              />
              Stain-normalise first (Macenko) — educational before/after
            </label>
            <p className="muted tiny">
              Re-run a sample after changing options. Settings file:{' '}
              <code>models/model_manifest.json</code>
              {manifest ? ` · ${manifest.label} · ${manifest.model_version}` : ''}.{' '}
              <Link to="/model-card">Model card →</Link>
            </p>
            {result?.macenkoBefore && result.macenkoAfter && (
              <div className="macenko-compare">
                <figure>
                  <img src={result.macenkoBefore} alt="Patch before Macenko normalisation" width={96} height={96} />
                  <figcaption>Before</figcaption>
                </figure>
                <figure>
                  <img src={result.macenkoAfter} alt="Patch after Macenko normalisation" width={96} height={96} />
                  <figcaption>After</figcaption>
                </figure>
              </div>
            )}
          </details>

          <details className="heatmap-explainer">
            <summary>How to read this heatmap</summary>
            <p>
              For a single 96×96 patch, warmer colors mark regions that contributed more to the
              metastasis score (class activation map from the final conv features and classifier
              weights — no gradients in the browser).
            </p>
            <p>
              For larger images, the overlay is a sliding-window probability map: each patch is
              scored separately and blended. A mosaic of separate patches is not contiguous tissue.
            </p>
          </details>
        </section>
      </div>
    </div>
  )
}
