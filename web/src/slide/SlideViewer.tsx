import { useEffect, useRef, useState } from 'react'
import OpenSeadragon from 'openseadragon'
import { PATCH_SIZE, heatmapColor } from '../lib/tensor'
import type { WorkerIn, WorkerOut } from '../workers/inference.worker'

export type RegionMeta = {
  id: string
  title: string
  width: number
  height: number
  patch_size: number
  grid: [number, number]
  display: string
  warning?: string
  attribution?: string
  license?: string
  license_verified?: string
  pseudo_slide?: boolean
}

type Outline = {
  type: string
  coordinates: number[][][]
  note?: string
}

type Props = {
  baseUrl: string
  regionPath: string
  meta: RegionMeta
}

function spiralPriority(cols: number, rows: number, cx: number, cy: number): Array<[number, number]> {
  const cells: Array<[number, number]> = []
  const seen = new Set<string>()
  const maxR = Math.max(cols, rows)
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const gx = cx + dx
        const gy = cy + dy
        if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue
        const key = `${gx},${gy}`
        if (seen.has(key)) continue
        seen.add(key)
        cells.push([gx, gy])
      }
    }
  }
  return cells
}

export default function SlideViewer({ baseUrl, regionPath, meta }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null)
  const heatCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const gridRef = useRef<Float32Array | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const paintRef = useRef<() => void>(() => undefined)

  const [showHeatmap, setShowHeatmap] = useState(true)
  const [showOutline, setShowOutline] = useState(true)
  const [opacity, setOpacity] = useState(0.45)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, pps: 0 })
  const [status, setStatus] = useState('Idle — tiles load without the model.')
  const [outline, setOutline] = useState<Outline | null>(null)
  const [hoverP, setHoverP] = useState<number | null>(null)

  const stride = meta.patch_size || PATCH_SIZE
  const cols = Math.max(1, Math.floor((meta.width - PATCH_SIZE) / stride) + 1)
  const rows = Math.max(1, Math.floor((meta.height - PATCH_SIZE) / stride) + 1)

  useEffect(() => {
    void fetch(`${baseUrl}${regionPath}outline.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Outline | null) => setOutline(j))
      .catch(() => setOutline(null))
  }, [baseUrl, regionPath])

  useEffect(() => {
    paintRef.current = () => {
      const canvas = heatCanvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, cols, rows)
      canvas.style.opacity = showHeatmap ? '1' : '0'
      if (!showHeatmap || !gridRef.current) return
      const img = ctx.createImageData(cols, rows)
      for (let i = 0; i < gridRef.current.length; i++) {
        const p = gridRef.current[i]!
        if (p < 0) continue
        const [r, g, b] = heatmapColor(p)
        const o = i * 4
        img.data[o] = r
        img.data[o + 1] = g
        img.data[o + 2] = b
        img.data[o + 3] = Math.round(opacity * 255 * Math.max(0.15, p))
      }
      ctx.putImageData(img, 0, 0)
    }
    paintRef.current()
  }, [showHeatmap, opacity, cols, rows, progress.done])

  useEffect(() => {
    if (!hostRef.current) return
    const heat = document.createElement('canvas')
    heat.width = cols
    heat.height = rows
    heat.className = 'slide-heatmap'
    heat.style.width = '100%'
    heat.style.height = '100%'
    heat.style.imageRendering = 'pixelated'
    heat.style.pointerEvents = 'none'
    heatCanvasRef.current = heat

    const viewer = OpenSeadragon({
      element: hostRef.current,
      prefixUrl: 'https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/images/',
      tileSources: {
        type: 'image',
        url: `${baseUrl}${regionPath}${meta.display}`,
      },
      showNavigator: true,
      navigatorPosition: 'BOTTOM_RIGHT',
      gestureSettingsMouse: { clickToZoom: false },
      maxZoomPixelRatio: 4,
      visibilityRatio: 0.5,
      constrainDuringPan: true,
    })
    viewerRef.current = viewer

    viewer.addHandler('open', () => {
      viewer.addOverlay({
        element: heat,
        location: new OpenSeadragon.Rect(0, 0, 1, 1),
        checkResize: false,
      })
      paintRef.current()
    })

    viewer.addHandler('canvas-click', (event) => {
      const e = event as unknown as { position?: OpenSeadragon.Point; quick?: boolean }
      if (!e.quick || !e.position || !gridRef.current) return
      const imgPt = viewer.viewport.viewerElementToImageCoordinates(e.position)
      const gx = Math.min(cols - 1, Math.max(0, Math.floor(imgPt.x / stride)))
      const gy = Math.min(rows - 1, Math.max(0, Math.floor(imgPt.y / stride)))
      const p = gridRef.current[gy * cols + gx]
      setHoverP(p != null && p >= 0 ? p : null)
    })

    return () => {
      viewer.destroy()
      viewerRef.current = null
      heatCanvasRef.current = null
    }
  }, [baseUrl, regionPath, meta.display, cols, rows, stride])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  async function startRun() {
    setStatus('Loading model in a Web Worker…')
    setRunning(true)
    setPaused(false)
    gridRef.current = new Float32Array(cols * rows).fill(-1)

    const worker = new Worker(new URL('../workers/inference.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker

    const modelUrl = `${baseUrl}models/pcam_cam.onnx`
    // Same self-hosted non-jsep pair as Demo (BASE_URL + ort/).
    const wasmPaths = `${baseUrl}ort/`

    worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const msg = ev.data
      if (msg.type === 'ready') {
        setStatus('Scoring tissue patches (visible-first spiral)…')
      } else if (msg.type === 'cell') {
        if (gridRef.current) {
          gridRef.current[msg.gy * cols + msg.gx] = msg.p
        }
      } else if (msg.type === 'progress') {
        setProgress({ done: msg.done, total: msg.total, pps: msg.pps })
        paintRef.current()
        if (msg.done % 10 === 0 || msg.done === msg.total) {
          setStatus(
            `${msg.done} / ${msg.total} patches · ${msg.pps.toFixed(1)} patches/s (measured)`,
          )
        }
      } else if (msg.type === 'done') {
        setRunning(false)
        setStatus('Done. Educational visualisation only — not a diagnostic viewer.')
        paintRef.current()
      } else if (msg.type === 'error') {
        setRunning(false)
        setStatus(msg.message)
      }
    }

    worker.postMessage({ type: 'init', modelUrl, wasmPaths } satisfies WorkerIn)

    const img = await createImageBitmap(
      await (await fetch(`${baseUrl}${regionPath}${meta.display}`)).blob(),
    )
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, c.width, c.height)
    const priority = spiralPriority(cols, rows, Math.floor(cols / 2), Math.floor(rows / 2))

    await new Promise<void>((resolve) => {
      const prev = worker.onmessage
      worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
        prev?.call(worker, ev)
        if (ev.data.type === 'ready') resolve()
      }
    })

    worker.postMessage(
      {
        type: 'score',
        width: imageData.width,
        height: imageData.height,
        stride,
        buffer: imageData.data.buffer,
        priority,
      } satisfies WorkerIn,
      [imageData.data.buffer],
    )
  }

  function togglePause() {
    const w = workerRef.current
    if (!w) return
    if (paused) {
      w.postMessage({ type: 'resume' } satisfies WorkerIn)
      setPaused(false)
    } else {
      w.postMessage({ type: 'pause' } satisfies WorkerIn)
      setPaused(true)
    }
  }

  const pct = progress.total ? Math.round((100 * progress.done) / progress.total) : 0

  return (
    <div className="slide-layout">
      <div className="slide-stage panel">
        <div className="slide-osd" ref={hostRef} tabIndex={0} aria-label="Slide pan zoom viewer" />
        {showOutline && outline?.coordinates?.[0] && (
          <svg
            className="slide-outline"
            viewBox={`0 0 ${meta.width} ${meta.height}`}
            aria-hidden="true"
          >
            <polygon
              points={outline.coordinates[0].map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke="#0e0e0e"
              strokeWidth="3"
              strokeDasharray="8 6"
            />
          </svg>
        )}
      </div>

      <aside className="slide-panel panel">
        <h2 className="section-title">Region</h2>
        <p className="muted tiny">{meta.title}</p>
        {meta.pseudo_slide && (
          <p className="slide-warn" role="note">
            {meta.warning}
          </p>
        )}

        <h2 className="section-title">Layers</h2>
        <label className="demo-opt">
          <input
            type="checkbox"
            checked={showHeatmap}
            onChange={(e) => setShowHeatmap(e.target.checked)}
          />
          Model heatmap
        </label>
        <label className="opacity-control">
          <span>Opacity</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            aria-valuetext={`${Math.round(opacity * 100)} percent`}
          />
        </label>
        <label className="demo-opt">
          <input
            type="checkbox"
            checked={showOutline}
            onChange={(e) => setShowOutline(e.target.checked)}
          />
          Expert outline (educational)
        </label>

        <h2 className="section-title">Model run</h2>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Slide scoring progress"
        >
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="muted tiny" aria-live="polite">
          {status}
          {hoverP != null ? ` · click cell p=${hoverP.toFixed(2)}` : ''}
        </p>
        <div className="slide-actions">
          {!running ? (
            <button type="button" className="btn" onClick={() => void startRun()}>
              Run model
            </button>
          ) : (
            <button type="button" className="btn secondary" onClick={togglePause}>
              {paused ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>
        <p className="muted tiny">
          Inference runs in a Web Worker. Keyboard: focus the viewer · OSD arrows pan · +/- zoom ·
          Home resets.
        </p>
        <p className="muted tiny">
          License {meta.license ?? 'CC0'}
          {meta.license_verified ? ` · verified ${meta.license_verified}` : ''}. {meta.attribution}
        </p>
      </aside>
    </div>
  )
}
