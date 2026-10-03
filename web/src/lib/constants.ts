/** Shared constants matching the training notebook / ONNX export contract. */

export const PATCH_SIZE = 96

/** ImageNet mean/std used in the Colab notebook preprocessing. */
export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const

/** Bundled model path (under Vite public/). */
export const MODEL_URL = `${import.meta.env.BASE_URL}models/pcam_cam.onnx`

/**
 * Honest status of the file currently in public/models/.
 * Surabhi should replace this with her own Colab export when ready.
 */
export const MODEL_STATUS = {
  kind: 'quick_baseline' as const,
  label: 'Quick baseline (Cursor-assisted)',
  detail:
    'Bundled ONNX was trained in a quick subset/epochs run with Cursor’s help so the live demo has a real model. It is a reference baseline — replace web/public/models/pcam_cam.onnx with Surabhi’s own Colab export. See results/baseline_quick_run.json for config and metrics.',
}
