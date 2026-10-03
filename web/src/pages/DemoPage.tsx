import { useEffect, useRef, useState } from 'react'
import samplesManifest from '../data/samples.json'
import { MODEL_STATUS } from '../lib/constants'
import { runInference, type InferenceResult } from '../lib/inference'

type Sample = (typeof samplesManifest.samples)[number]

export default function DemoPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [groundTruth, setGroundTruth] = useState<boolean | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InferenceResult | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const objectUrlRef = useRef<string | null>(null)

  useEffect(() => {
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
      // Alpha-blend the heatmap (putImageData would overwrite the base image).
      const overlayCanvas = document.createElement('canvas')
      overlayCanvas.width = result.displayWidth
      overlayCanvas.height = result.displayHeight
      overlayCanvas.getContext('2d')!.putImageData(result.overlay, 0, 0)
      ctx.drawImage(overlayCanvas, 0, 0)
    }
    img.src = sourceUrl
  }, [sourceUrl, result])

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
      setGroundTruth(meta ? meta.groundTruthTumor : undefined)
      const out = await runInference(src)
      setResult(out)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Inference failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fade-in">
      <div className="status-banner" role="status">
        <div>
          <strong>{MODEL_STATUS.label}</strong>
          <span>{MODEL_STATUS.detail}</span>
        </div>
      </div>

      <div className="demo-layout">
        <section className="panel">
          <h2 className="section-title">Sample gallery</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {samplesManifest.disclaimer} Click any image to run the detector in your
            browser — nothing is uploaded to a server.
          </p>
          <div className="gallery-grid">
            {samplesManifest.samples.map((sample) => (
              <button
                key={sample.id}
                type="button"
                className={`gallery-item${selectedId === sample.id ? ' selected' : ''}`}
                onClick={() => analyze(`${import.meta.env.BASE_URL}${sample.src}`, sample)}
                disabled={busy}
              >
                <img
                  src={`${import.meta.env.BASE_URL}${sample.src}`}
                  alt={`${sample.label} sample`}
                  width={96}
                  height={96}
                />
                <figcaption>
                  {sample.kind === 'tile' ? (
                    <span className="badge tile">tile</span>
                  ) : sample.groundTruthTumor ? (
                    <span className="badge tumor">tumor</span>
                  ) : (
                    <span className="badge normal">normal</span>
                  )}
                  {sample.label}
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
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void analyze(file)
                  e.target.value = ''
                }}
              />
            </label>
            {busy && <span className="muted">Running model…</span>}
          </div>
          {error && <p className="error-text">{error}</p>}
        </section>

        <section className="panel">
          <h2 className="section-title">Prediction &amp; heatmap</h2>
          <div className="viewer">
            {!sourceUrl && (
              <div className="viewer-empty">
                Choose a gallery image or upload one to see a prediction and overlay.
              </div>
            )}
            {sourceUrl && <canvas ref={canvasRef} aria-label="Image with heatmap overlay" />}
          </div>

          <div className="metrics">
            <div className="metric">
              <div className="label">P(metastasis)</div>
              <div className="value">
                {result ? `${(result.probability * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="metric">
              <div className="label">Mode</div>
              <div className="value" style={{ fontSize: '1.05rem', paddingTop: '0.35rem' }}>
                {result
                  ? result.mode === 'single-patch'
                    ? 'Single patch CAM'
                    : 'Sliding-window map'
                  : '—'}
              </div>
            </div>
          </div>

          {groundTruth !== undefined && (
            <p className="muted" style={{ marginTop: '0.9rem', marginBottom: 0 }}>
              Gallery ground truth:{' '}
              {groundTruth === null
                ? 'mixed / unlabeled tile'
                : groundTruth
                  ? 'tumor (metastasis-positive patch)'
                  : 'normal (metastasis-negative patch)'}
              . Compare with the model score — with the placeholder model, agreement is
              meaningless.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
