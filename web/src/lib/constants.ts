/** Shared constants matching the training notebook / ONNX export contract. */

export const PATCH_SIZE = 96

/** ImageNet mean/std used in the Colab notebook preprocessing. */
export const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const
export const IMAGENET_STD = [0.229, 0.224, 0.225] as const

/** Bundled model path (under Vite public/). */
export const MODEL_URL = `${import.meta.env.BASE_URL}models/pcam_cam.onnx`

/**
 * Honest status of the file currently in public/models/.
 * Surabhi should flip this to 'trained' after she drops in her Colab export
 * and update the UI copy in ModelStatusBanner.
 */
export const MODEL_STATUS = {
  kind: 'untrained_placeholder' as const,
  label: 'Untrained placeholder model',
  detail:
    'The bundled ONNX file has random weights so the site can run before training finishes. It is not a metastasis detector. Replace web/public/models/pcam_cam.onnx with your Colab export when ready.',
}
