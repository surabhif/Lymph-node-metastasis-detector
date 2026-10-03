/** Shared constants matching the training notebook / ONNX export contract. */

export const PATCH_SIZE = 96

/** ImageNet mean/std used in the Colab notebook preprocessing. */
export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const

/** Bundled model path (under Vite public/). */
export const MODEL_URL = `${import.meta.env.BASE_URL}models/pcam_cam.onnx`

/** Cache name for the ONNX weights in the browser Cache API. */
export const MODEL_CACHE = 'pcam-onnx-v2-int8'

/**
 * Visitor-facing model label. Paths / quantization notes live in the README
 * and on the Model card “Current served model” section — not in the site banner.
 */
export const MODEL_STATUS = {
  kind: 'quick_baseline_int8' as const,
  label: 'Quick baseline',
  sizeHintMb: 11,
}

export const SITE = {
  title: 'Lymph Node Metastasis Detector',
  shortTitle: 'PCam Metastasis Detector',
  tagline: 'In-browser research demo on PatchCamelyon',
  githubUrl: 'https://github.com/surabhif/Lymph-node-metastasis-detector',
  pagesUrl: 'https://surabhif.github.io/Lymph-node-metastasis-detector/',
}
