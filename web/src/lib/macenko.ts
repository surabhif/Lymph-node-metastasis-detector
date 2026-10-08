/**
 * Lightweight Macenko-style stain normalisation for optional Demo before/after.
 * Uses a fixed H&E reference when the manifest has not yet exported fitted matrices.
 * Not a clinical stain pipeline — educational only.
 */

const DEFAULT_STAIN = [
  [0.65, 0.07],
  [0.7, 0.99],
  [0.29, 0.11],
] // 3×2 (RGB × H,E) approximate literature defaults

const DEFAULT_MAX_C = [1.0, 1.0]

function rgbToOd(r: number, g: number, b: number, io = 255): [number, number, number] {
  const clamp = (x: number) => Math.max(x, 1)
  return [-Math.log(clamp(r) / io), -Math.log(clamp(g) / io), -Math.log(clamp(b) / io)]
}

function odToRgb(od: [number, number, number], io = 255): [number, number, number] {
  return [
    Math.min(255, Math.max(0, io * Math.exp(-od[0]))),
    Math.min(255, Math.max(0, io * Math.exp(-od[1]))),
    Math.min(255, Math.max(0, io * Math.exp(-od[2]))),
  ]
}

/** In-place-ish: returns a new ImageData normalised toward the reference stain. */
export function macenkoNormalizeImageData(
  src: ImageData,
  stainMatrix: number[][] = DEFAULT_STAIN,
  maxC: number[] = DEFAULT_MAX_C,
): ImageData {
  const { width, height, data } = src
  const out = new ImageData(width, height)
  const stain = stainMatrix
  // Pseudoinverse-ish projection onto 2 stain vectors (least squares via normal eq for 3×2)
  // For each pixel OD ≈ stain * conc  →  conc ≈ (SᵀS)⁻¹ Sᵀ OD
  const s00 = stain[0]![0]!
  const s01 = stain[0]![1]!
  const s10 = stain[1]![0]!
  const s11 = stain[1]![1]!
  const s20 = stain[2]![0]!
  const s21 = stain[2]![1]!
  const a00 = s00 * s00 + s10 * s10 + s20 * s20
  const a01 = s00 * s01 + s10 * s11 + s20 * s21
  const a11 = s01 * s01 + s11 * s11 + s21 * s21
  const det = a00 * a11 - a01 * a01 || 1e-8
  const inv00 = a11 / det
  const inv01 = -a01 / det
  const inv11 = a00 / det

  for (let i = 0; i < data.length; i += 4) {
    const od = rgbToOd(data[i]!, data[i + 1]!, data[i + 2]!)
    const y0 = s00 * od[0] + s10 * od[1] + s20 * od[2]
    const y1 = s01 * od[0] + s11 * od[1] + s21 * od[2]
    let c0 = inv00 * y0 + inv01 * y1
    let c1 = inv01 * y0 + inv11 * y1
    c0 = Math.max(0, Math.min(maxC[0]!, c0))
    c1 = Math.max(0, Math.min(maxC[1]!, c1))
    const nod: [number, number, number] = [
      s00 * c0 + s01 * c1,
      s10 * c0 + s11 * c1,
      s20 * c0 + s21 * c1,
    ]
    const [r, g, b] = odToRgb(nod)
    out.data[i] = r
    out.data[i + 1] = g
    out.data[i + 2] = b
    out.data[i + 3] = 255
  }
  return out
}

export function imageElementToImageData(img: HTMLImageElement): ImageData {
  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, c.width, c.height)
}

export function imageDataToCanvas(data: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = data.width
  c.height = data.height
  c.getContext('2d')!.putImageData(data, 0, 0)
  return c
}
