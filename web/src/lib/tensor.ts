/** DOM-free-ish ImageNet tensor helpers shared by Demo and the slide Worker. */

export const PATCH_SIZE = 96
export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const

/** Convert RGBA ImageData crop to CHW float32 ImageNet-normalized tensor. */
export function imageDataToTensor(
  data: ImageData,
  sx = 0,
  sy = 0,
  sw = PATCH_SIZE,
  sh = PATCH_SIZE,
): Float32Array {
  const { width, data: px } = data
  const tensor = new Float32Array(3 * PATCH_SIZE * PATCH_SIZE)
  const plane = PATCH_SIZE * PATCH_SIZE
  for (let y = 0; y < PATCH_SIZE; y++) {
    const syi = Math.min(data.height - 1, sy + Math.floor((y * sh) / PATCH_SIZE))
    for (let x = 0; x < PATCH_SIZE; x++) {
      const sxi = Math.min(width - 1, sx + Math.floor((x * sw) / PATCH_SIZE))
      const i = (syi * width + sxi) * 4
      const r = px[i]! / 255
      const g = px[i + 1]! / 255
      const b = px[i + 2]! / 255
      const o = y * PATCH_SIZE + x
      tensor[o] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0]
      tensor[plane + o] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1]
      tensor[2 * plane + o] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2]
    }
  }
  return tensor
}

export function heatmapColor(t: number): [number, number, number] {
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
