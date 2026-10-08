import type * as OrtNS from 'onnxruntime-web'
import { MODEL_CACHE, MODEL_URL, ORT_WASM_PATHS, PATCH_SIZE } from './constants'
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
import { applyCalibration, loadModelManifest } from './modelSettings'

export type InferenceOptions = {
  tta?: boolean
  macenko?: boolean
  /** Apply calibration from model_manifest (default true). */
  calibrate?: boolean
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

let ortModule: OrtModule | null = null
let sessionPromise: Promise<OrtNS.InferenceSession> | null = null
let cachedBuffer: ArrayBuffer | null = null

async function loadOrt(): Promise<OrtModule> {
  if (ortModule) return ortModule
  // Dynamic import keeps onnxruntime-web out of the entry chunk (Home/About/Results).
  const mod = await import('onnxruntime-web')
  ortModule = mod
  return mod
}

function configureOrt(ort: OrtModule): void {
  // Self-host the single wasm variant used by the WASM EP (see vite ort-wasm plugin).
  ort.env.wasm.wasmPaths = ORT_WASM_PATHS
  ort.env.wasm.numThreads = 1
}

async function fetchModelBuffer(onProgress?: ProgressCb): Promise<ArrayBuffer> {
  if (cachedBuffer) return cachedBuffer

  onProgress?.({
    status: 'checking-cache',
    loadedBytes: 0,
    totalBytes: null,
    message: 'Checking browser cache…',
  })

  try {
    const cache = await caches.open(MODEL_CACHE)
    const hit = await cache.match(MODEL_URL)
    if (hit) {
      const buf = await hit.arrayBuffer()
      cachedBuffer = buf
      onProgress?.({
        status: 'creating-session',
        loadedBytes: buf.byteLength,
        totalBytes: buf.byteLength,
        message: 'Loaded model from cache…',
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
    message: 'Downloading model…',
  })

  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`Model download failed (${res.status})`)
  const total = Number(res.headers.get('Content-Length')) || null
  const reader = res.body?.getReader()
  if (!reader) {
    const buf = await res.arrayBuffer()
    cachedBuffer = buf
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
          ? `Downloading model… ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`
          : `Downloading model… ${(loaded / 1e6).toFixed(1)} MB`,
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
  cachedBuffer = buf

  try {
    const cache = await caches.open(MODEL_CACHE)
    await cache.put(
      MODEL_URL,
      new Response(buf.slice(0), {
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    )
  } catch {
    // ignore cache write failures
  }

  return buf
}

export async function preloadModel(onProgress?: ProgressCb): Promise<OrtNS.InferenceSession> {
  const alreadyLoading = Boolean(sessionPromise)
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        const ort = await loadOrt()
        configureOrt(ort)
        const buffer = await fetchModelBuffer(onProgress)
        onProgress?.({
          status: 'creating-session',
          loadedBytes: buffer.byteLength,
          totalBytes: buffer.byteLength,
          message: 'Initializing ONNX Runtime…',
        })
        const session = await ort.InferenceSession.create(buffer, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        })
        onProgress?.({
          status: 'ready',
          loadedBytes: buffer.byteLength,
          totalBytes: buffer.byteLength,
          message: 'Model ready',
        })
        return session
      } catch (err) {
        sessionPromise = null
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
  const session = await sessionPromise
  if (alreadyLoading && cachedBuffer) {
    onProgress?.({
      status: 'ready',
      loadedBytes: cachedBuffer.byteLength,
      totalBytes: cachedBuffer.byteLength,
      message: 'Model ready',
    })
  }
  return session
}

export async function getSession(onProgress?: ProgressCb): Promise<OrtNS.InferenceSession> {
  return preloadModel(onProgress)
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
      `ONNX model must output probability, features, cam_weights (got: ${outputs.join(', ')})`,
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

export async function runInference(
  source: string | File,
  onProgress?: ProgressCb,
  options: InferenceOptions = {},
): Promise<InferenceResult> {
  const ort = await loadOrt()
  const session = await getSession(onProgress)
  const manifest = await loadModelManifest()
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
