import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import samplesManifest from '../data/samples.json'
import ConfidenceBar from '../components/ConfidenceBar'
import GlossaryTip from '../components/GlossaryTip'
import { MODEL_STATUS, PATCH_SIZE } from '../lib/constants'
import {
  preloadModel,
  runInference,
  type InferenceResult,
  type LoadProgress,
} from '../lib/inference'
import { camToOverlay, probabilityMapOverlay } from '../lib/image'
import { downloadResultCard } from '../lib/downloadResultCard'
import {
  loadModelManifest,
  verdictFor,
  verdictLabel,
  type ModelManifest,
  type Verdict,
} from '../lib/modelSettings'

type Sample = (typeof samplesManifest.samples)[number]

type FailureItem = {
  kind: 'fn' | 'fp'
  testIndex: number
  trueLabel: string
  score: number
  threshold: number
  patch: string
}

type HardCaseNote = {
  kind: 'fn' | 'fp'
  testIndex: number
  trueLabel: string
  recordedScore: number
  threshold: number
}

type BatchRowStatus = 'queued' | 'running' | 'done' | 'error'

type BatchRow = {
  id: string
  filename: string
  objectUrl: string
  status: BatchRowStatus
  score: number | null
  label: string | null
  verdict: Verdict | null
  uncertain: boolean | null
  error?: string
}

const BATCH_CAP = 20

function formatPct(p: number) {
  return `${(p * 100).toFixed(1)}%`
}

function downloadBatchCsv(
  rows: BatchRow[],
  threshold: number,
  lo: number,
  hi: number,
  modelVersion: string,
) {
  const header =
    'filename,score,label,uncertain,threshold,uncertain_lo,uncertain_hi,model_version'
  const lines = rows
    .filter((r) => r.status === 'done' && r.score != null && r.label != null)
    .map((r) => {
      const score = (r.score! * 100).toFixed(1)
      const uncertain = r.uncertain ? 'true' : 'false'
      const safeName = `"${r.filename.replace(/"/g, '""')}"`
      const safeLabel = `"${r.label!.replace(/"/g, '""')}"`
      return [
        safeName,
        score,
        safeLabel,
        uncertain,
        threshold,
        lo,
        hi,
        modelVersion,
      ].join(',')
    })
  const blob = new Blob([[header, ...lines].join('\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'batch-scores.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function failureToSample(item: FailureItem): Sample {
  const tumor = item.trueLabel === 'tumor'
  return {
    id: `failure_${item.kind}_${item.testIndex}`,
    kind: 'patch',
    src: item.patch,
    label: item.trueLabel,
    groundTruthTumor: tumor,
    testIndex: item.testIndex,
    note: 'From the official-test failure gallery (model mistake).',
  }
}

export default function DemoPage() {
  const [searchParams] = useSearchParams()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedMeta, setSelectedMeta] = useState<Sample | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InferenceResult | null>(null)
  const [hardCase, setHardCase] = useState<HardCaseNote | null>(null)
  const [failurePool, setFailurePool] = useState<FailureItem[] | null>(null)
  const [inferMs, setInferMs] = useState<number | null>(null)
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
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [batchRows, setBatchRows] = useState<BatchRow[]>([])
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(
    null,
  )
  const [batchMessage, setBatchMessage] = useState<string | null>(null)
  const [batchDragOver, setBatchDragOver] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const objectUrlRef = useRef<string | null>(null)
  const batchUrlsRef = useRef<string[]>([])
  const preloadDone = useRef(false)
  const optsRef = useRef({ tta: false, macenko: false })
  optsRef.current = { tta: useTta, macenko: useMacenko }
  const galleryBusy = busy || batchBusy

  // Defer ORT + model download until the visitor asks (or deep-links a sample).
  useEffect(() => {
    void loadModelManifest().then(setManifest).catch(() => setManifest(null))
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      for (const url of batchUrlsRef.current) URL.revokeObjectURL(url)
      batchUrlsRef.current = []
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

  async function analyze(src: string | File, meta?: Sample, hard?: HardCaseNote | null) {
    setBusy(true)
    setError(null)
    setResult(null)
    setHardCase(hard ?? null)
    setInferMs(null)
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
      const t0 = performance.now()
      const out = await runInference(src, setLoadProgress, {
        tta: optsRef.current.tta,
        macenko: optsRef.current.macenko,
      })
      const t1 = performance.now()
      setInferMs(Math.round(t1 - t0))
      setResult(out)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Inference failed')
      setInferMs(null)
    } finally {
      setBusy(false)
    }
  }

  function clearBatchRows() {
    for (const url of batchUrlsRef.current) URL.revokeObjectURL(url)
    batchUrlsRef.current = []
    setBatchRows([])
    setBatchProgress(null)
    setBatchMessage(null)
  }

  async function runBatch(files: File[]) {
    if (files.length === 0) return
    if (files.length > BATCH_CAP) {
      setBatchMessage(
        `Please choose at most ${BATCH_CAP} images at a time. You selected ${files.length}.`,
      )
      return
    }

    clearBatchRows()
    setBatchMessage(null)
    setBatchBusy(true)

    const rows: BatchRow[] = files.map((file, i) => {
      const objectUrl = URL.createObjectURL(file)
      batchUrlsRef.current.push(objectUrl)
      return {
        id: `${file.name}-${file.size}-${i}-${Date.now()}`,
        filename: file.name,
        objectUrl,
        status: 'queued',
        score: null,
        label: null,
        verdict: null,
        uncertain: null,
      }
    })
    setBatchRows(rows)
    setBatchProgress({ done: 0, total: rows.length })

    let settings = manifest
    if (!settings) {
      try {
        settings = await loadModelManifest()
        setManifest(settings)
      } catch {
        settings = null
      }
    }
    const batchThreshold = settings?.threshold ?? 0.5
    const batchLo = settings?.uncertain_lo ?? 0.35
    const batchHi = settings?.uncertain_hi ?? 0.65

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]!
        const rowId = rows[i]!.id
        setBatchRows((prev) =>
          prev.map((r) => (r.id === rowId ? { ...r, status: 'running' } : r)),
        )
        try {
          const out = await runInference(file, setLoadProgress, {
            tta: optsRef.current.tta,
            macenko: optsRef.current.macenko,
          })
          const v = verdictFor(out.probability, batchThreshold, batchLo, batchHi)
          setBatchRows((prev) =>
            prev.map((r) =>
              r.id === rowId
                ? {
                    ...r,
                    status: 'done',
                    score: out.probability,
                    label: verdictLabel(v),
                    verdict: v,
                    uncertain: v === 'uncertain',
                  }
                : r,
            ),
          )
        } catch (err) {
          console.error(err)
          setBatchRows((prev) =>
            prev.map((r) =>
              r.id === rowId
                ? {
                    ...r,
                    status: 'error',
                    error: err instanceof Error ? err.message : 'Inference failed',
                  }
                : r,
            ),
          )
        }
        setBatchProgress({ done: i + 1, total: files.length })
      }
    } finally {
      setBatchBusy(false)
    }
  }

  function acceptBatchFiles(list: FileList | File[] | null) {
    if (!list) return
    const files = Array.from(list).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) {
      setBatchMessage('No image files found. Please drop or select image files.')
      return
    }
    void runBatch(files)
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
          Choose a real PCam test-set <GlossaryTip term="patch">patch</GlossaryTip> or upload your
          own image. Scoring runs entirely in your browser. The cutoff and uncertain range come from
          the model&apos;s settings, chosen on validation data.
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
          or click Load model. Later visits can use the browser cache.
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
                disabled={galleryBusy || loadProgress.status === 'error'}
                aria-pressed={selectedId === sample.id}
              >
                <img
                  src={`${import.meta.env.BASE_URL}${sample.src}`}
                  alt={
                    sample.kind === 'tile'
                      ? 'PCam stitched mosaic of hematoxylin-and-eosin stained lymph-node tissue patches'
                      : `PCam test patch ${'testIndex' in sample ? sample.testIndex : ''}, hematoxylin-and-eosin stained lymph-node tissue, ground truth ${sample.groundTruthTumor ? 'tumor' : 'normal'}`
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
                disabled={galleryBusy || loadProgress.status === 'error'}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void analyze(file)
                  e.target.value = ''
                }}
              />
            </label>
            <button
              type="button"
              className="btn secondary"
              disabled={galleryBusy || loadProgress.status === 'error'}
              onClick={() => {
                void (async () => {
                  try {
                    let pool = failurePool
                    if (!pool) {
                      const res = await fetch(
                        `${import.meta.env.BASE_URL}results/failure_gallery.json`,
                      )
                      if (!res.ok) throw new Error('Could not load hard cases')
                      const data = (await res.json()) as { items: FailureItem[] }
                      pool = data.items
                      setFailurePool(pool)
                    }
                    const item = pool[Math.floor(Math.random() * pool.length)]!
                    const note: HardCaseNote = {
                      kind: item.kind,
                      testIndex: item.testIndex,
                      trueLabel: item.trueLabel,
                      recordedScore: item.score,
                      threshold: item.threshold,
                    }
                    await analyze(
                      `${import.meta.env.BASE_URL}${item.patch}`,
                      failureToSample(item),
                      note,
                    )
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not load a hard case')
                  }
                })()
              }}
            >
              Try a hard one
            </button>
            {busy && <span className="muted">Running model…</span>}
            {batchBusy && <span className="muted">Batch scoring…</span>}
          </div>
          {hardCase && (
            <p className="hard-case-note" role="note">
              This patch is from the failure gallery: the model got it wrong on the official test
              set
              {hardCase.kind === 'fn'
                ? ` (true tumor, but the recorded score was only ${(hardCase.recordedScore * 100).toFixed(2)}%, below the ${(hardCase.threshold * 100).toFixed(2)}% cutoff — a missed metastasis).`
                : ` (true normal, but the recorded score was ${(hardCase.recordedScore * 100).toFixed(2)}%, above the cutoff — a false alarm).`}{' '}
              These cases are tricky because stain, texture, or small tumor regions can fool the
              model. See the <Link to="/failures">failures page</Link>.
            </p>
          )}
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
              <div className="gauge-label">Calibrated tumor chance</div>
              {verdict && (
                <p className={`verdict-pill verdict-${verdict}`} aria-live="polite">
                  {verdictLabel(verdict)}
                </p>
              )}
            </div>

            <div className="gt-card">
              <ConfidenceBar
                score={result?.probability ?? null}
                threshold={threshold}
                uncertainLo={lo}
                uncertainHi={hi}
              />
              <div className="label" style={{ marginTop: '0.75rem' }}>
                Ground truth
              </div>
              {selectedMeta ? (
                gt === null || gt === undefined ? (
                  <p>Stitched mosaic of separate test patches. No single patch label.</p>
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
                    ? 'Single-patch heatmap (CAM)'
                    : 'Sliding-window probability map'
                  : '—'}
              </p>
              {inferMs != null && result && (
                <p className="speed-note" aria-live="polite">
                  Scored in {inferMs} ms on your device
                </p>
              )}
            </div>
          </div>

          <div className="demo-actions-row">
            <label className="opacity-control">
              <span>Heatmap opacity (0–100%)</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(opacity * 100)}
                onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                disabled={!result}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(opacity * 100)}
                aria-valuetext={`${Math.round(opacity * 100)} percent`}
              />
              <span className="muted">{Math.round(opacity * 100)}%</span>
            </label>
            <button
              type="button"
              className="btn secondary"
              disabled={!result || !canvasRef.current || downloadBusy}
              onClick={() => {
                if (!result || !canvasRef.current) return
                setDownloadBusy(true)
                void downloadResultCard({
                  overlayCanvas: canvasRef.current,
                  patchUrl: sourceUrl,
                  score: result.probability,
                  label: verdict ? verdictLabel(verdict) : 'Scored',
                  modelVersion: manifest?.model_version ?? 'full_pcam_int8_v1',
                })
                  .catch((err: unknown) => {
                    setError(err instanceof Error ? err.message : 'Download failed')
                  })
                  .finally(() => setDownloadBusy(false))
              }}
            >
              {downloadBusy ? 'Saving…' : 'Download result PNG'}
            </button>
          </div>
          <p className="muted tiny">
            Drag toward 0% to hide the overlay, or toward 100% to see it more strongly on the patch.
            The download is one image with the patch, heatmap, score, model version, and a research
            disclaimer.
          </p>
          <p className="muted tiny heatmap-legend" aria-hidden={false}>
            Heatmap legend: cool means lower contribution; warm means higher contribution to the
            tumor score.
          </p>

          <details className="heatmap-explainer demo-options">
            <summary>Options</summary>
            <label className="demo-opt">
              <input
                type="checkbox"
                checked={useTta}
                onChange={(e) => setUseTta(e.target.checked)}
              />
              Test-time augmentation (8 flips/rotations; slower)
            </label>
            <label className="demo-opt">
              <input
                type="checkbox"
                checked={useMacenko}
                onChange={(e) => setUseMacenko(e.target.checked)}
              />
              Stain-normalize first (Macenko); educational before/after
            </label>
            <p className="muted tiny">
              Re-run a sample after changing options. Cutoff and uncertain range follow the live
              model settings
              {manifest ? ` (${manifest.label})` : ''}. See the{' '}
              <Link to="/model-card">Model card</Link> for technical detail.
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
              metastasis score. That overlay is a{' '}
              <GlossaryTip term="Grad-CAM">Grad-CAM</GlossaryTip>-style class-activation map (
              <GlossaryTip term="CAM">CAM</GlossaryTip>) built from the final convolution features
              and classifier weights. No gradients run in the browser.
            </p>
            <p>
              For larger images, the overlay is a sliding-window probability map: each patch is
              scored separately and blended. A mosaic of separate patches is not continuous tissue.
            </p>
          </details>
        </section>
      </div>

      <section className="panel batch-section" aria-labelledby="batch-heading">
        <h2 id="batch-heading" className="section-title">
          Batch upload
        </h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Drop or select up to {BATCH_CAP} images to score them one after another in your browser.
          This research demo is for learning only, not clinical use. Results use the same model
          settings as the single-image gallery above.
        </p>

        <div
          className={`batch-dropzone${batchDragOver ? ' drag-over' : ''}${batchBusy ? ' busy' : ''}`}
          onDragEnter={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (!galleryBusy && loadProgress.status !== 'error') setBatchDragOver(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (e.currentTarget === e.target) setBatchDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setBatchDragOver(false)
            if (galleryBusy || loadProgress.status === 'error') return
            acceptBatchFiles(e.dataTransfer.files)
          }}
        >
          <p className="batch-dropzone-title">Drop images here</p>
          <p className="muted tiny">PNG, JPEG, or other common image types. Cap {BATCH_CAP} files.</p>
          <label className="btn secondary">
            Select multiple images
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              multiple
              disabled={galleryBusy || loadProgress.status === 'error'}
              onChange={(e) => {
                acceptBatchFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
        </div>

        {batchMessage && (
          <p className="error-text" role="alert">
            {batchMessage}
          </p>
        )}

        {batchProgress && (
          <p className="muted batch-progress" aria-live="polite">
            {batchBusy
              ? `Scoring ${batchProgress.done} of ${batchProgress.total}…`
              : `Finished ${batchProgress.done} of ${batchProgress.total}.`}
          </p>
        )}

        {batchRows.length > 0 && (
          <>
            <div className="batch-table-wrap">
              <table className="batch-table">
                <thead>
                  <tr>
                    <th scope="col">Thumbnail</th>
                    <th scope="col">Score</th>
                    <th scope="col">Label</th>
                    <th scope="col">Uncertain</th>
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((row) => (
                    <tr key={row.id} data-status={row.status}>
                      <td className="batch-thumb-cell">
                        <img
                          className="batch-thumb"
                          src={row.objectUrl}
                          alt=""
                          width={48}
                          height={48}
                        />
                        <span className="batch-filename" title={row.filename}>
                          {row.filename}
                        </span>
                      </td>
                      <td>
                        {row.status === 'done' && row.score != null
                          ? formatPct(row.score)
                          : row.status === 'running'
                            ? '…'
                            : row.status === 'error'
                              ? '—'
                              : 'queued'}
                      </td>
                      <td>
                        {row.status === 'done' && row.label && row.verdict ? (
                          <span className={`verdict-pill verdict-${row.verdict}`}>
                            {row.label}
                          </span>
                        ) : row.status === 'error' ? (
                          <span className="error-text">{row.error ?? 'Failed'}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {row.status === 'done' ? (row.uncertain ? 'Yes' : 'No') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="batch-actions">
              <button
                type="button"
                className="btn secondary"
                disabled={
                  batchBusy || !batchRows.some((r) => r.status === 'done' && r.score != null)
                }
                onClick={() =>
                  downloadBatchCsv(
                    batchRows,
                    threshold,
                    lo,
                    hi,
                    manifest?.model_version ?? 'full_pcam_int8_v1',
                  )
                }
              >
                Download CSV
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={batchBusy}
                onClick={() => clearBatchRows()}
              >
                Clear batch
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
