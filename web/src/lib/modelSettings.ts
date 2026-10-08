export type Calibration =
  | { method: 'none'; note?: string }
  | { method: 'temperature'; T: number; note?: string }
  | { method: 'platt'; a: number; b: number; note?: string }

export type ModelManifest = {
  model_version: string
  label: string
  threshold: number
  uncertain_lo: number
  uncertain_hi: number
  calibration: Calibration
  macenko?: { enabled?: boolean; note?: string; stain_matrix?: number[][]; max_c?: number[] }
  tta?: { default?: boolean; transforms?: number }
  status: string
  full_retrain_status?: string
}

let cached: ModelManifest | null = null

export async function loadModelManifest(): Promise<ModelManifest> {
  if (cached) return cached
  const url = `${import.meta.env.BASE_URL}models/model_manifest.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load model_manifest.json (${res.status})`)
  cached = (await res.json()) as ModelManifest
  return cached
}

export function applyCalibration(rawProbOrLogit: number, cal: Calibration, fromLogit = false): number {
  // ONNX already outputs probability; recover a logit when needed.
  const logit = fromLogit
    ? rawProbOrLogit
    : Math.log(Math.min(1 - 1e-7, Math.max(1e-7, rawProbOrLogit)) / (1 - Math.min(1 - 1e-7, Math.max(1e-7, rawProbOrLogit))))

  if (cal.method === 'temperature') {
    return 1 / (1 + Math.exp(-(logit / cal.T)))
  }
  if (cal.method === 'platt') {
    return 1 / (1 + Math.exp(-(cal.a * logit + cal.b)))
  }
  return fromLogit ? 1 / (1 + Math.exp(-rawProbOrLogit)) : rawProbOrLogit
}

export type Verdict = 'likely_tumor' | 'uncertain' | 'likely_normal'

export function verdictFor(
  p: number,
  threshold: number,
  lo: number,
  hi: number,
): Verdict {
  if (p >= lo && p <= hi) return 'uncertain'
  return p >= threshold ? 'likely_tumor' : 'likely_normal'
}

export function verdictLabel(v: Verdict): string {
  if (v === 'likely_tumor') return 'Likely tumor'
  if (v === 'likely_normal') return 'Likely normal'
  return 'Uncertain'
}
