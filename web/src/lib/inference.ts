import type * as OrtNS from 'onnxruntime-web'
import {
  BASELINE_MODEL_CACHE,
  BASELINE_MODEL_URL,
  MODEL_CACHE,
  MODEL_URL,
  ORT_WASM_PATHS,
  PATCH_SIZE,
} from './constants'
import {
  camToOverlay,
  computeCam,
  imageToTensor,
  loadImage,
  probabilityMapOverlay,
} from './image'
import {
  imageDataToCanvas,
  imageElementToImageData,
  macenkoNormalizeImageData,
} from './macenko'
import {
  applyCalibration,
  loadBaselineModelManifest,
  loadModelManifest,
  type ModelManifest,
} from './modelSettings'

/** Which ONNX weights to use. Baseline is lazy-loaded only for old-vs-new compare. */
export type ModelSlot = 'current' | 'baseline'

export type InferenceOptions = {
  tta?: boolean
  macenko?: boolean
  /** Apply calibration from that slot's manifest (default true). */
  calibrate?: boolean
  /** Default `current` (live full-PCam). `baseline` loads the earlier model on demand. */
  model?: ModelSlot
}

export type InferenceResult = {
  probability: number
  rawProbability: number
  mode: 'single-patch' | 'sliding-window'
  overlay: ImageData
  cam?: Float32Array
  camH?: number
  camW?: number
  displayWidth: number
  displayHeight: number
  patchMap?: number[][]
  macenkoBefore?: string
  macenkoAfter?: string
}

export type LoadProgress = {
  status: 'idle' | 'checking-cache' | 'downloading' | 'creating-session' | 'ready' | 'error'
  loadedBytes: number
  totalBytes: number | null
  message: string
}

type ProgressCb = (p: LoadProgress) => void
type OrtModule = typeof OrtNS

type SlotConfig = {
  url: string
  cacheName: string
  label: string
}

const SLOT: Record<ModelSlot, SlotConfig> = {
  current: { url: MODEL_URL, cacheName: MODEL_CACHE, label: 'model' },
  baseline: {
    url: BASELINE_MODEL_URL,
    cacheName: BASELINE_MODEL_CACHE,
    label: 'earlier model',
  },
}

let ortModule: OrtModule | null = null
const sessionPromises: Partial<Record<ModelSlot, Promise<OrtNS.InferenceSession>>> = {}
const cachedBuffers: Partial<Record<ModelSlot, ArrayBuffer>> = {}

async function loadOrt(): Promise<OrtModule> {
  if (ortModule) return ortModule
  // WASM-only entry expects ort-wasm-simd-threaded.{mjs,wasm} under wasmPaths
  // (not the default jsep pair). Lazy import keeps ORT out of Home/About/Results.
  const mod = await import('onnxruntime-web/wasm')
  ortModule = mod
  return mod
}

function configureOrt(ort: OrtModule): void {
  // Self-host the single wasm variant used by the WASM EP (see vite ort-wasm plugin).
  ort.env.wasm.wasmPaths = ORT_WASM_PATHS
  ort.env.wasm.numThreads = 1
}

async function fetchModelBuffer(
  slot: ModelSlot,
  onProgress?: ProgressCb,
): Promise<ArrayBuffer> {
  const hitBuf = cachedBuffers[slot]
  if (hitBuf) return hitBuf

  const { url, cacheName, label } = SLOT[slot]

  onProgress?.({
    status: 'checking-cache',
    loadedBytes: 0,
    totalBytes: null,
    message: slot === 'baseline' ? 'Checking earlier-model cache…' : 'Checking browser cache…',
  })

  try {
    const cache = await caches.open(cacheName)
    const hit = await cache.match(url)
    if (hit) {
      const buf = await hit.arrayBuffer()
      cachedBuffers[slot] = buf
      onProgress?.({
        status: 'creating-session',
        loadedBytes: buf.byteLength,
        totalBytes: buf.byteLength,
        message: `Loaded ${label} from cache…`,
      })
      return buf
    }
  } catch {
    // Cache API may be unavailable (private mode); fall through to fetch.
  }

  onProgress?.({
    status: 'downloading',
    loadedBytes: 0,
    totalBytes: null,
    message: slot === 'baseline' ? 'Downloading earlier model…' : 'Downloading model…',
  })

  const res = await fetch(url)
  if (!res.ok) throw new Error(`${label} download failed (${res.status})`)
  const total = Number(res.headers.get('Content-Length')) || null
  const reader = res.body?.getReader()
  if (!reader) {
    const buf = await res.arrayBuffer()
    cachedBuffers[slot] = buf
    return buf
  }

  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value)
      loaded += value.byteLength
      onProgress?.({
        status: 'downloading',
        loadedBytes: loaded,
        totalBytes: total,
        message: total
          ? `Downloading ${label}… ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`
          : `Downloading ${label}… ${(loaded / 1e6).toFixed(1)} MB`,
      })
    }
  }

  const merged = new Uint8Array(loaded)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.byteLength
  }
  const buf = merged.buffer
  cachedBuffers[slot] = buf

  try {
    const cache = await caches.open(cacheName)
    await cache.put(
      url,
      new Response(buf.slice(0), {
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    )
  } catch {
    // ignore cache write failures
  }

  return buf
}

export async function preloadModel(
  onProgress?: ProgressCb,
  slot: ModelSlot = 'current',
): Promise<OrtNS.InferenceSession> {
  const alreadyLoading = Boolean(sessionPromises[slot])
  if (!sessionPromises[slot]) {
    sessionPromises[slot] = (async () => {
      try {
        const ort = await loadOrt()
        configureOrt(ort)
        const buffer = await fetchModelBuffer(slot, onProgress)
        onProgress?.({
          status: 'creating-session',
          loadedBytes: buffer.byteLength,
          totalBytes: buffer.byteLength,
          message:
            slot === 'baseline'
              ? 'Initializing earlier model…'
              : 'Initializing ONNX Runtime…',
        })
        const session = await ort.InferenceSession.create(buffer, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        })
        onProgress?.({
          status: 'ready',
          loadedBytes: buffer.byteLength,
          totalBytes: buffer.byteLength,
          message: slot === 'baseline' ? 'Earlier model ready' : 'Model ready',
        })
        return session
      } catch (err) {
        sessionPromises[slot] = undefined
        onProgress?.({
          status: 'error',
          loadedBytes: 0,
          totalBytes: null,
          message: err instanceof Error ? err.message : 'Failed to load model',
        })
        throw err
      }
    })()
  }
  const session = await sessionPromises[slot]!
  const buf = cachedBuffers[slot]
  if (alreadyLoading && buf) {
    onProgress?.({
      status: 'ready',
      loadedBytes: buf.byteLength,
      totalBytes: buf.byteLength,
      message: slot === 'baseline' ? 'Earlier model ready' : 'Model ready',
    })
  }
  return session
}

export async function getSession(
  onProgress?: ProgressCb,
  slot: ModelSlot = 'current',
): Promise<OrtNS.InferenceSession> {
  return preloadModel(onProgress, slot)
}

async function manifestForSlot(slot: ModelSlot): Promise<ModelManifest> {
  return slot === 'baseline' ? loadBaselineModelManifest() : loadModelManifest()
}

async function runPatch(
  session: OrtNS.InferenceSession,
  tensorData: Float32Array,
  ort: OrtModule,
): Promise<{ probability: number; features: OrtNS.Tensor; camWeights: Float32Array }> {
  const input = new ort.Tensor('float32', tensorData, [1, 3, PATCH_SIZE, PATCH_SIZE])
  const out = await session.run({ input })
  const outputs = session.outputNames
  const probabilityTensor = out.probability ?? (outputs[0] ? out[outputs[0]] : undefined)
  const featuresTensor = out.features ?? (outputs[1] ? out[outputs[1]] : undefined)
  const weightsTensor = out.cam_weights ?? (outputs[2] ? out[outputs[2]] : undefined)
  if (!probabilityTensor || !featuresTensor || !weightsTensor) {
    throw new Error(
      `Model output is incomplete (need score, features, and heatmap weights; got: ${outputs.join(', ')})`,
    )
  }
  return {
    probability: (probabilityTensor.data as Float32Array)[0] ?? 0,
    features: featuresTensor,
    camWeights: weightsTensor.data as Float32Array,
  }
}

/** Eight Dihedral-group views (flips / 90° rotations) averaged for TTA. */
async function ttaProbabilities(
  session: OrtNS.InferenceSession,
  source: CanvasImageSource,
  ort: OrtModule,
): Promise<{ mean: number; features: OrtNS.Tensor; camWeights: Float32Array }> {
  const views: CanvasImageSource[] = []
  const base = document.createElement('canvas')
  base.width = PATCH_SIZE
  base.height = PATCH_SIZE
  const bctx = base.getContext('2d')!
  bctx.drawImage(source as CanvasImageSource, 0, 0, PATCH_SIZE, PATCH_SIZE)
  for (const flip of [false, true]) {
    for (let rot = 0; rot < 4; rot++) {
      const c = document.createElement('canvas')
      c.width = PATCH_SIZE
      c.height = PATCH_SIZE
      const ctx = c.getContext('2d')!
      ctx.translate(PATCH_SIZE / 2, PATCH_SIZE / 2)
      ctx.rotate((rot * Math.PI) / 2)
      if (flip) ctx.scale(-1, 1)
      ctx.drawImage(base, -PATCH_SIZE / 2, -PATCH_SIZE / 2)
      views.push(c)
    }
  }
  let sum = 0
  let first: { features: OrtNS.Tensor; camWeights: Float32Array } | null = null
  for (const v of views) {
    const tensor = imageToTensor(v)
    const out = await runPatch(session, tensor, ort)
    sum += out.probability
    if (!first) first = { features: out.features, camWeights: out.camWeights }
  }
  return { mean: sum / views.length, features: first!.features, camWeights: first!.camWeights }
}

/**
 * Score a single patch from ImageData / canvas using the already-loaded session.
 * Skips CAM / overlay work — used for live stain-perturbation compares on Demo.
 */
export async function runProbabilityOnImageSource(
  source: CanvasImageSource | ImageData,
  onProgress?: ProgressCb,
  options: Pick<InferenceOptions, 'calibrate' | 'model'> = {},
): Promise<{ probability: number; rawProbability: number }> {
  const slot = options.model ?? 'current'
  const ort = await loadOrt()
  const session = await getSession(onProgress, slot)
  const manifest = await manifestForSlot(slot)
  const tensor = imageToTensor(source)
  const { probability: raw } = await runPatch(session, tensor, ort)
  const calibrate = options.calibrate !== false
  const probability = calibrate ? applyCalibration(raw, manifest.calibration) : raw
  return { probability, rawProbability: raw }
}

export async function runInference(
  source: string | File,
  onProgress?: ProgressCb,
  options: InferenceOptions = {},
): Promise<InferenceResult> {
  const slot = options.model ?? 'current'
  const ort = await loadOrt()
  const session = await getSession(onProgress, slot)
  const manifest = await manifestForSlot(slot)
  let img = await loadImage(source)
  let macenkoBefore: string | undefined
  let macenkoAfter: string | undefined

  if (options.macenko) {
    const before = imageElementToImageData(img)
    const stain = manifest.macenko?.stain_matrix
    const maxC = manifest.macenko?.max_c
    const after = macenkoNormalizeImageData(before, stain, maxC)
    const beforeUrl = imageDataToCanvas(before).toDataURL('image/png')
    const afterCanvas = imageDataToCanvas(after)
    const afterUrl = afterCanvas.toDataURL('image/png')
    macenkoBefore = beforeUrl
    macenkoAfter = afterUrl
    img = await loadImage(afterUrl)
  }

  const width = img.naturalWidth
  const height = img.naturalHeight
  const calibrate = options.calibrate !== false

  if (width <= PATCH_SIZE + 8 && height <= PATCH_SIZE + 8) {
    let raw: number
    let features: OrtNS.Tensor
    let camWeights: Float32Array
    if (options.tta) {
      const tta = await ttaProbabilities(session, img, ort)
      raw = tta.mean
      features = tta.features
      camWeights = tta.camWeights
    } else {
      const tensor = imageToTensor(img)
      const out = await runPatch(session, tensor, ort)
      raw = out.probability
      features = out.features
      camWeights = out.camWeights
    }
    const probability = calibrate ? applyCalibration(raw, manifest.calibration) : raw
    const [, channels, camH, camW] = features.dims
    const cam = computeCam(
      features.data as Float32Array,
      camWeights,
      channels,
      camH,
      camW,
    )
    const overlay = camToOverlay(cam, camH, camW, width, height, 1)
    return {
      probability,
      rawProbability: raw,
      mode: 'single-patch',
      overlay,
      cam,
      camH,
      camW,
      displayWidth: width,
      displayHeight: height,
      macenkoBefore,
      macenkoAfter,
    }
  }

  const stride = Math.max(32, Math.floor(PATCH_SIZE / 2))
  const cols = Math.max(1, Math.floor((width - PATCH_SIZE) / stride) + 1)
  const rows = Math.max(1, Math.floor((height - PATCH_SIZE) / stride) + 1)
  const patchMap: number[][] = []
  let probSum = 0
  let count = 0

  for (let gy = 0; gy < rows; gy++) {
    const row: number[] = []
    for (let gx = 0; gx < cols; gx++) {
      const sx = Math.min(gx * stride, Math.max(0, width - PATCH_SIZE))
      const sy = Math.min(gy * stride, Math.max(0, height - PATCH_SIZE))
      const tensor = imageToTensor(img, sx, sy, PATCH_SIZE, PATCH_SIZE)
      const { probability: raw } = await runPatch(session, tensor, ort)
      const probability = calibrate ? applyCalibration(raw, manifest.calibration) : raw
      row.push(probability)
      probSum += probability
      count += 1
    }
    patchMap.push(row)
  }

  const overlay = probabilityMapOverlay(patchMap, width, height, PATCH_SIZE, stride, 1)
  return {
    probability: count ? probSum / count : 0,
    rawProbability: count ? probSum / count : 0,
    mode: 'sliding-window',
    overlay,
    displayWidth: width,
    displayHeight: height,
    patchMap,
    macenkoBefore,
    macenkoAfter,
  }
}
