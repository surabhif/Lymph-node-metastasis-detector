import { IMAGENET_MEAN, IMAGENET_STD, PATCH_SIZE } from './constants'

/** Load an image URL or File into an HTMLImageElement. */
export function loadImage(src: string | File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = typeof src === 'string' ? src : URL.createObjectURL(src)
  })
}

/** Draw image (or a crop) into a PATCH_SIZE canvas and return ImageNet-normalized CHW float32. */
export function imageToTensor(
  img: CanvasImageSource,
  sx = 0,
  sy = 0,
  sw?: number,
  sh?: number,
): Float32Array {
  const canvas = document.createElement('canvas')
  canvas.width = PATCH_SIZE
  canvas.height = PATCH_SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  const sourceW =
    sw ??
    (img instanceof HTMLImageElement
      ? img.naturalWidth
      : img instanceof HTMLCanvasElement
        ? img.width
        : PATCH_SIZE)
  const sourceH =
    sh ??
    (img instanceof HTMLImageElement
      ? img.naturalHeight
      : img instanceof HTMLCanvasElement
        ? img.height
        : PATCH_SIZE)

  ctx.drawImage(img, sx, sy, sourceW, sourceH, 0, 0, PATCH_SIZE, PATCH_SIZE)
  const { data } = ctx.getImageData(0, 0, PATCH_SIZE, PATCH_SIZE)

  const tensor = new Float32Array(3 * PATCH_SIZE * PATCH_SIZE)
  const plane = PATCH_SIZE * PATCH_SIZE
  for (let i = 0; i < plane; i++) {
    const r = data[i * 4]! / 255
    const g = data[i * 4 + 1]! / 255
    const b = data[i * 4 + 2]! / 255
    tensor[i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0]
    tensor[plane + i] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1]
    tensor[2 * plane + i] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2]
  }
  return tensor
}

/**
 * Class activation map without gradients:
 *   CAM(h,w) = sum_c cam_weights[c] * features[c,h,w]
 * then ReLU + min-max normalize to [0,1].
 */
export function computeCam(
  features: Float32Array,
  camWeights: Float32Array,
  channels: number,
  height: number,
  width: number,
): Float32Array {
  const cam = new Float32Array(height * width)
  for (let c = 0; c < channels; c++) {
    const w = camWeights[c]!
    const offset = c * height * width
    for (let i = 0; i < height * width; i++) {
      cam[i]! += w * features[offset + i]!
    }
  }

  // ReLU
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < cam.length; i++) {
    cam[i] = Math.max(0, cam[i]!)
    min = Math.min(min, cam[i]!)
    max = Math.max(max, cam[i]!)
  }
  const denom = max - min < 1e-8 ? 1 : max - min
  for (let i = 0; i < cam.length; i++) {
    cam[i] = (cam[i]! - min) / denom
  }
  return cam
}

/** Upsample a small CAM to target size and paint as a translucent jet-ish overlay. */
export function camToOverlay(
  cam: Float32Array,
  camH: number,
  camW: number,
  targetW: number,
  targetH: number,
  alpha = 0.45,
): ImageData {
  const out = new ImageData(targetW, targetH)
  for (let y = 0; y < targetH; y++) {
    const cy = ((y + 0.5) * camH) / targetH - 0.5
    const y0 = Math.max(0, Math.floor(cy))
    const y1 = Math.min(camH - 1, y0 + 1)
    const fy = cy - y0
    for (let x = 0; x < targetW; x++) {
      const cx = ((x + 0.5) * camW) / targetW - 0.5
      const x0 = Math.max(0, Math.floor(cx))
      const x1 = Math.min(camW - 1, x0 + 1)
      const fx = cx - x0
      const v00 = cam[y0 * camW + x0]!
      const v01 = cam[y0 * camW + x1]!
      const v10 = cam[y1 * camW + x0]!
      const v11 = cam[y1 * camW + x1]!
      const v = v00 * (1 - fx) * (1 - fy) + v01 * fx * (1 - fy) + v10 * (1 - fx) * fy + v11 * fx * fy
      const [r, g, b] = heatmapColor(v)
      const i = (y * targetW + x) * 4
      out.data[i] = r
      out.data[i + 1] = g
      out.data[i + 2] = b
      out.data[i + 3] = Math.round(alpha * v * 255)
    }
  }
  return out
}

/** Simple blue→cyan→yellow→red map. */
function heatmapColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t))
  if (x < 0.25) {
    const u = x / 0.25
    return [0, Math.round(64 + 191 * u), 255]
  }
  if (x < 0.5) {
    const u = (x - 0.25) / 0.25
    return [0, 255, Math.round(255 * (1 - u))]
  }
  if (x < 0.75) {
    const u = (x - 0.5) / 0.25
    return [Math.round(255 * u), 255, 0]
  }
  const u = (x - 0.75) / 0.25
  return [255, Math.round(255 * (1 - u)), 0]
}

/** Paint a patch-probability grid as a translucent overlay. */
export function probabilityMapOverlay(
  probs: number[][],
  targetW: number,
  targetH: number,
  patchSize: number,
  stride: number,
  alpha = 0.42,
): ImageData {
  const rows = probs.length
  const cols = probs[0]?.length ?? 0
  const out = new ImageData(targetW, targetH)
  const counts = new Float32Array(targetW * targetH)
  const acc = new Float32Array(targetW * targetH)

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const p = probs[gy]![gx]!
      const x0 = gx * stride
      const y0 = gy * stride
      for (let y = y0; y < Math.min(targetH, y0 + patchSize); y++) {
        for (let x = x0; x < Math.min(targetW, x0 + patchSize); x++) {
          const i = y * targetW + x
          acc[i]! += p
          counts[i]! += 1
        }
      }
    }
  }

  for (let i = 0; i < acc.length; i++) {
    const v = counts[i]! > 0 ? acc[i]! / counts[i]! : 0
    const [r, g, b] = heatmapColor(v)
    const o = i * 4
    out.data[o] = r
    out.data[o + 1] = g
    out.data[o + 2] = b
    out.data[o + 3] = Math.round(alpha * v * 255)
  }
  return out
}
