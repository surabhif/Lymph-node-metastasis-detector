import * as ort from 'onnxruntime-web'
import { MODEL_URL, PATCH_SIZE } from './constants'
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
  displayWidth: number
  displayHeight: number
  patchMap?: number[][]
}

let sessionPromise: Promise<ort.InferenceSession> | null = null

function configureOrt(): void {
  // Load WASM from the same version on jsDelivr so Vite does not need to copy binaries.
  // Keep in sync with package.json dependency onnxruntime-web.
  ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/'
  ort.env.wasm.numThreads = 1
}

export async function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    configureOrt()
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    })
  }
  return sessionPromise
}

async function runPatch(
  session: ort.InferenceSession,
  tensorData: Float32Array,
): Promise<{ probability: number; features: ort.Tensor; camWeights: Float32Array }> {
  const input = new ort.Tensor('float32', tensorData, [1, 3, PATCH_SIZE, PATCH_SIZE])
  const feeds: Record<string, ort.Tensor> = { input }
  const out = await session.run(feeds)

  // Prefer named outputs; fall back to positional order if an export renamed weights.
  const outputs = session.outputNames
  const probabilityTensor =
    out.probability ?? (outputs[0] ? out[outputs[0]] : undefined)
  const featuresTensor = out.features ?? (outputs[1] ? out[outputs[1]] : undefined)
  const weightsTensor = out.cam_weights ?? (outputs[2] ? out[outputs[2]] : undefined)
  if (!probabilityTensor || !featuresTensor || !weightsTensor) {
    throw new Error(
      `ONNX model must output probability, features, cam_weights (got: ${outputs.join(', ')})`,
    )
  }

  const probability = (probabilityTensor.data as Float32Array)[0] ?? 0
  const camWeights = weightsTensor.data as Float32Array
  return { probability, features: featuresTensor, camWeights }
}

export async function runInference(source: string | File): Promise<InferenceResult> {
  const session = await getSession()
  const img = await loadImage(source)
  const width = img.naturalWidth
  const height = img.naturalHeight

  // Single-patch path for images at or near PCam size
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
    const overlay = camToOverlay(cam, camH, camW, width, height)
    return {
      probability,
      mode: 'single-patch',
      overlay,
      displayWidth: width,
      displayHeight: height,
    }
  }

  // Sliding-window scan for larger tiles
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

  const overlay = probabilityMapOverlay(patchMap, width, height, PATCH_SIZE, stride)
  return {
    probability: count ? probSum / count : 0,
    mode: 'sliding-window',
    overlay,
    displayWidth: width,
    displayHeight: height,
    patchMap,
  }
}
