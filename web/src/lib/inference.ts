import * as ort from 'onnxruntime-web'
import { MODEL_CACHE, MODEL_URL, PATCH_SIZE } from './constants'
import {
  camToOverlay,
  computeCam,
  imageToTensor,
  loadImage,
  probabilityMapOverlay,
} from './image'

export type InferenceResult = {
  probability: number
  mode: 'single-patch' | 'sliding-window'
  overlay: ImageData
  cam?: Float32Array
  camH?: number
  camW?: number
  displayWidth: number
  displayHeight: number
  patchMap?: number[][]
}

export type LoadProgress = {
  status: 'idle' | 'checking-cache' | 'downloading' | 'creating-session' | 'ready' | 'error'
  loadedBytes: number
  totalBytes: number | null
  message: string
}

type ProgressCb = (p: LoadProgress) => void

let sessionPromise: Promise<ort.InferenceSession> | null = null
let cachedBuffer: ArrayBuffer | null = null

function configureOrt(): void {
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'
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

export async function preloadModel(onProgress?: ProgressCb): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        configureOrt()
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
  return sessionPromise
}

export async function getSession(onProgress?: ProgressCb): Promise<ort.InferenceSession> {
  return preloadModel(onProgress)
}

async function runPatch(
  session: ort.InferenceSession,
  tensorData: Float32Array,
): Promise<{ probability: number; features: ort.Tensor; camWeights: Float32Array }> {
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

export async function runInference(
  source: string | File,
  onProgress?: ProgressCb,
): Promise<InferenceResult> {
  const session = await getSession(onProgress)
  const img = await loadImage(source)
  const width = img.naturalWidth
  const height = img.naturalHeight

  if (width <= PATCH_SIZE + 8 && height <= PATCH_SIZE + 8) {
    const tensor = imageToTensor(img)
    const { probability, features, camWeights } = await runPatch(session, tensor)
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
      mode: 'single-patch',
      overlay,
      cam,
      camH,
      camW,
      displayWidth: width,
      displayHeight: height,
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
      const { probability } = await runPatch(session, tensor)
      row.push(probability)
      probSum += probability
      count += 1
    }
    patchMap.push(row)
  }

  const overlay = probabilityMapOverlay(patchMap, width, height, PATCH_SIZE, stride, 1)
  return {
    probability: count ? probSum / count : 0,
    mode: 'sliding-window',
    overlay,
    displayWidth: width,
    displayHeight: height,
    patchMap,
  }
}
