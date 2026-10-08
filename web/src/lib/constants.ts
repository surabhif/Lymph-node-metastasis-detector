/** Shared constants matching the training notebook / ONNX export contract. */

export const PATCH_SIZE = 96

/** ImageNet mean/std used in the Colab notebook preprocessing. */
export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const

/** Bundled model path (under Vite public/). */
export const MODEL_URL = `${import.meta.env.BASE_URL}models/pcam_cam.onnx`

/** Self-hosted ORT wasm directory (single variant; jsep wasm is not shipped). */
export const ORT_WASM_PATHS = `${import.meta.env.BASE_URL}ort/`

/** Cache name for the ONNX weights in the browser Cache API. */
export const MODEL_CACHE = 'pcam-onnx-v3-fuller-int8'

/**
 * Visitor-facing model label. Paths / quantization notes live in the README
 * and on the Model card “Current served model” section — not in the site banner.
 */
export const MODEL_STATUS = {
  kind: 'improved_baseline_int8' as const,
  label: 'Improved baseline',
  sizeHintMb: 11,
}

export const SITE = {
  title: 'Lymph Node Metastasis Detector',
  shortTitle: 'PCam Metastasis Detector',
  tagline: 'In-browser research demo on PatchCamelyon',
  githubUrl: 'https://github.com/surabhif/Lymph-node-metastasis-detector',
  pagesUrl: 'https://surabhif.github.io/Lymph-node-metastasis-detector/',
}

/** Fixed citation metadata — never use Date.getFullYear() on the cite box. */
export const CITATION = {
  author: 'Fadnavis, S.',
  year: 2026,
  title: 'Lymph Node Metastasis Detector: a PatchCamelyon research demo',
  version: '0.1.0',
  dateReleased: '2026-10-01',
  url: SITE.pagesUrl,
} as const

