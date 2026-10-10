/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm'
import { PATCH_SIZE, imageDataToTensor } from '../lib/tensor'
import type { Calibration } from '../lib/modelSettings'

export type WorkerIn =
  | {
      type: 'init'
      modelUrl: string
      wasmPaths: string
      calibration?: Calibration
    }
  | {
      type: 'score'
      width: number
      height: number
      stride: number
      buffer: ArrayBuffer
      priority: Array<[number, number]>
    }
  | { type: 'pause' }
  | { type: 'resume' }

export type WorkerOut =
  | { type: 'ready' }
  | { type: 'cell'; gx: number; gy: number; p: number }
  | { type: 'progress'; done: number; total: number; pps: number }
  | { type: 'done' }
  | { type: 'error'; message: string }

let session: ort.InferenceSession | null = null
let paused = false
let abortScore = false
let calibration: Calibration = { method: 'none' }

function applyCalibration(raw: number, cal: Calibration): number {
  const clipped = Math.min(1 - 1e-7, Math.max(1e-7, raw))
  const logit = Math.log(clipped / (1 - clipped))
  if (cal.method === 'temperature') {
    return 1 / (1 + Math.exp(-(logit / cal.T)))
  }
  if (cal.method === 'platt') {
    return 1 / (1 + Math.exp(-(cal.a * logit + cal.b)))
  }
  return raw
}

async function ensureSession(modelUrl: string, wasmPaths: string) {
  if (session) return session
  ort.env.wasm.wasmPaths = wasmPaths
  ort.env.wasm.numThreads = 1
  const res = await fetch(modelUrl)
  if (!res.ok) throw new Error(`Model fetch failed (${res.status})`)
  const buf = await res.arrayBuffer()
  session = await ort.InferenceSession.create(buf, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })
  return session
}

async function runOne(sess: ort.InferenceSession, tensor: Float32Array): Promise<number> {
  const input = new ort.Tensor('float32', tensor, [1, 3, PATCH_SIZE, PATCH_SIZE])
  const out = await sess.run({ input })
  const probabilityTensor = out.probability ?? out[sess.outputNames[0]!]
  const raw = (probabilityTensor.data as Float32Array)[0] ?? 0
  return applyCalibration(raw, calibration)
}

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const msg = ev.data
  try {
    if (msg.type === 'pause') {
      paused = true
      return
    }
    if (msg.type === 'resume') {
      paused = false
      return
    }
    if (msg.type === 'init') {
      calibration = msg.calibration ?? { method: 'none' }
      await ensureSession(msg.modelUrl, msg.wasmPaths)
      ;(self as DedicatedWorkerGlobalScope).postMessage({ type: 'ready' } satisfies WorkerOut)
      return
    }
    if (msg.type === 'score') {
      abortScore = false
      paused = false
      const sess = session
      if (!sess) throw new Error('Worker not initialised')
      const rgba = new Uint8ClampedArray(msg.buffer)
      const imageData = new ImageData(rgba, msg.width, msg.height)
      const total = msg.priority.length
      let done = 0
      const t0 = performance.now()
      for (const [gx, gy] of msg.priority) {
        while (paused) {
          await new Promise((r) => setTimeout(r, 50))
          if (abortScore) break
        }
        if (abortScore) break
        const sx = Math.min(gx * msg.stride, Math.max(0, msg.width - PATCH_SIZE))
        const sy = Math.min(gy * msg.stride, Math.max(0, msg.height - PATCH_SIZE))
        const tensor = imageDataToTensor(imageData, sx, sy, PATCH_SIZE, PATCH_SIZE)
        const p = await runOne(sess, tensor)
        done += 1
        const elapsed = (performance.now() - t0) / 1000
        const pps = elapsed > 0 ? done / elapsed : 0
        ;(self as DedicatedWorkerGlobalScope).postMessage({
          type: 'cell',
          gx,
          gy,
          p,
        } satisfies WorkerOut)
        if (done % 4 === 0 || done === total) {
          ;(self as DedicatedWorkerGlobalScope).postMessage({
            type: 'progress',
            done,
            total,
            pps,
          } satisfies WorkerOut)
        }
      }
      ;(self as DedicatedWorkerGlobalScope).postMessage({ type: 'done' } satisfies WorkerOut)
    }
  } catch (err) {
    ;(self as DedicatedWorkerGlobalScope).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : 'Worker error',
    } satisfies WorkerOut)
  }
}

export {}
