/**
 * Canvas / ImageData colour perturbations mirroring
 * scripts/run_stain_robustness_onnx.py → apply_perturbation
 * (torchvision PIL adjust_hue / brightness / contrast / saturation).
 *
 * Fixed seeds keep live Demo scores stable across reloads.
 */

import { mulberry32 } from './prng'

/** Same seed as the ONNX stain robustness script. */
export const STAIN_PERTURB_SEED = 42

export type StainPerturbationId =
  | 'clean'
  | 'mild_color_jitter'
  | 'warmer'
  | 'cooler'
  | 'he_channel_scale'

export type StainPerturbationSpec = {
  id: StainPerturbationId
  /** Plain educational label for the Demo row. */
  label: string
}

export const STAIN_COMPARE_PERTURBATIONS: readonly StainPerturbationSpec[] = [
  { id: 'clean', label: 'Clean' },
  { id: 'mild_color_jitter', label: 'Mild colour jitter' },
  { id: 'warmer', label: 'Warmer' },
  { id: 'cooler', label: 'Cooler' },
  { id: 'he_channel_scale', label: 'H&E channel scale' },
] as const

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)))
}

function cloneImageData(src: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(src.data), src.width, src.height)
}

/** Uniform in [lo, hi) via a seeded PRNG — stable across runs. */
function uniform(rand: () => number, lo: number, hi: number): number {
  return lo + (hi - lo) * rand()
}

/**
 * PIL ImageEnhance blend: out = degenerate*(1-factor) + image*factor
 * (factor may be outside [0, 1]).
 */
function blendWith(
  src: ImageData,
  degenerateRgb: (r: number, g: number, b: number, i: number) => [number, number, number],
  factor: number,
): ImageData {
  const out = cloneImageData(src)
  const d = out.data
  const s = src.data
  for (let i = 0; i < s.length; i += 4) {
    const r = s[i]!
    const g = s[i + 1]!
    const b = s[i + 2]!
    const [dr, dg, db] = degenerateRgb(r, g, b, i)
    d[i] = clampByte(dr * (1 - factor) + r * factor)
    d[i + 1] = clampByte(dg * (1 - factor) + g * factor)
    d[i + 2] = clampByte(db * (1 - factor) + b * factor)
  }
  return out
}

/** torchvision / PIL ImageEnhance.Brightness */
export function adjustBrightness(src: ImageData, factor: number): ImageData {
  return blendWith(src, () => [0, 0, 0], factor)
}

/** Mean of ITU-R BT.601 luma (PIL "L" conversion). */
function meanLuma(src: ImageData): number {
  const d = src.data
  let sum = 0
  const n = src.width * src.height
  for (let i = 0; i < d.length; i += 4) {
    sum += (d[i]! * 299 + d[i + 1]! * 587 + d[i + 2]! * 114) / 1000
  }
  return sum / n
}

/** torchvision / PIL ImageEnhance.Contrast — blend toward mean-gray. */
export function adjustContrast(src: ImageData, factor: number): ImageData {
  const mean = Math.round(meanLuma(src))
  return blendWith(src, () => [mean, mean, mean], factor)
}

/** torchvision / PIL ImageEnhance.Color (saturation) — blend toward grayscale. */
export function adjustSaturation(src: ImageData, factor: number): ImageData {
  return blendWith(
    src,
    (r, g, b) => {
      const y = Math.round((r * 299 + g * 587 + b * 114) / 1000)
      return [y, y, y]
    },
    factor,
  )
}

/** CLIP8 as used in Pillow Convert.c. */
function clip8(v: number): number {
  return Math.max(0, Math.min(255, v | 0))
}

/**
 * Pillow rgb2hsv_row (colorsys-style) — H,S,V each in 0..255.
 * Used by torchvision.transforms.functional.adjust_hue on PIL images.
 */
function rgbToHsvPil(r: number, g: number, b: number): [number, number, number] {
  const maxc = Math.max(r, g, b)
  const minc = Math.min(r, g, b)
  const v = maxc
  if (minc === maxc) return [0, 0, v]
  const cr = maxc - minc
  const s = cr / maxc
  const rc = (maxc - r) / cr
  const gc = (maxc - g) / cr
  const bc = (maxc - b) / cr
  let h: number
  if (r === maxc) h = bc - gc
  else if (g === maxc) h = 2 + rc - bc
  else h = 4 + gc - rc
  // incorrect hue happens if h/6 is negative — match Pillow fmod
  h = ((h / 6 + 1) % 1 + 1) % 1
  const uh = clip8(Math.trunc(h * 255))
  const us = clip8(Math.trunc(s * 255))
  return [uh, us, v]
}

/** Pillow hsv2rgb (colorsys-style). */
function hsvToRgbPil(h: number, s: number, v: number): [number, number, number] {
  if (s === 0) return [v, v, v]
  const i = Math.floor((h * 6) / 255)
  const f = (h * 6) / 255 - i
  const fs = s / 255
  const p = clip8(Math.round(v * (1 - fs)))
  const q = clip8(Math.round(v * (1 - fs * f)))
  const t = clip8(Math.round(v * (1 - fs * (1 - f))))
  switch (i % 6) {
    case 0:
      return [v, t, p]
    case 1:
      return [q, v, p]
    case 2:
      return [p, v, t]
    case 3:
      return [p, q, v]
    case 4:
      return [t, p, v]
    default:
      return [v, p, q]
  }
}

/**
 * torchvision adjust_hue (PIL path):
 * np_h += np.int32(hue_factor * 255).astype(np.uint8)  — wraps as uint8.
 */
export function adjustHue(src: ImageData, hueFactor: number): ImageData {
  if (hueFactor < -0.5 || hueFactor > 0.5) {
    throw new Error(`hue_factor (${hueFactor}) is not in [-0.5, 0.5]`)
  }
  const delta = (Math.trunc(hueFactor * 255) >>> 0) & 0xff
  const out = cloneImageData(src)
  const d = out.data
  for (let i = 0; i < d.length; i += 4) {
    const [h, s, v] = rgbToHsvPil(d[i]!, d[i + 1]!, d[i + 2]!)
    const nh = (h + delta) & 0xff
    const [r, g, b] = hsvToRgbPil(nh, s, v)
    d[i] = r
    d[i + 1] = g
    d[i + 2] = b
  }
  return out
}

/** Approximate H&E RGB channel scaling from the robustness script. */
export function heChannelScale(src: ImageData, hScale: number, eScale: number): ImageData {
  const out = cloneImageData(src)
  const d = out.data
  const s = src.data
  const gScale = 0.5 * hScale + 0.5 * eScale
  for (let i = 0; i < s.length; i += 4) {
    d[i] = clampByte(s[i]! * eScale)
    d[i + 1] = clampByte(s[i + 1]! * gScale)
    d[i + 2] = clampByte(s[i + 2]! * hScale)
  }
  return out
}

/**
 * Apply one named perturbation. Random knobs use a fresh PRNG from
 * `STAIN_PERTURB_SEED` (mirrors Random(SEED + index*17) with index 0).
 */
export function applyStainPerturbation(
  src: ImageData,
  name: StainPerturbationId,
  seed: number = STAIN_PERTURB_SEED,
): ImageData {
  if (name === 'clean') return cloneImageData(src)

  if (name === 'warmer') return adjustHue(src, 0.06)
  if (name === 'cooler') return adjustHue(src, -0.06)

  if (name === 'mild_color_jitter') {
    const rand = mulberry32(seed)
    const hue = uniform(rand, -0.04, 0.04)
    const sat = uniform(rand, 0.85, 1.15)
    const contrast = uniform(rand, 0.9, 1.1)
    const brightness = uniform(rand, 0.9, 1.1)
    // Order matches the Python script: hue → sat → contrast → brightness
    return adjustBrightness(
      adjustContrast(adjustSaturation(adjustHue(src, hue), sat), contrast),
      brightness,
    )
  }

  if (name === 'he_channel_scale') {
    const rand = mulberry32(seed)
    const hScale = uniform(rand, 0.75, 1.25)
    const eScale = uniform(rand, 0.75, 1.25)
    return heChannelScale(src, hScale, eScale)
  }

  const _exhaustive: never = name
  throw new Error(`Unknown perturbation: ${_exhaustive}`)
}

export function imageDataToObjectUrl(data: ImageData): string {
  const c = document.createElement('canvas')
  c.width = data.width
  c.height = data.height
  c.getContext('2d')!.putImageData(data, 0, 0)
  return c.toDataURL('image/png')
}
