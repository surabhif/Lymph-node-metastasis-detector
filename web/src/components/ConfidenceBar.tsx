import './ConfidenceBar.css'

export type ConfidenceBarProps = {
  /** Calibrated score in [0, 1]. Null when no score yet. */
  score: number | null
  /** Decision cutoff from model_manifest (e.g. ~0.5201). */
  threshold: number
  /** Uncertain band low from model_manifest. */
  uncertainLo: number
  /** Uncertain band high from model_manifest. */
  uncertainHi: number
  /** Optional compact layout for side panels. */
  compact?: boolean
  className?: string
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

function pctLabel(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`
}

export default function ConfidenceBar({
  score,
  threshold,
  uncertainLo,
  uncertainHi,
  compact = false,
  className,
}: ConfidenceBarProps) {
  const t = clamp01(threshold)
  const lo = clamp01(Math.min(uncertainLo, uncertainHi))
  const hi = clamp01(Math.max(uncertainLo, uncertainHi))
  const hasScore = score != null && Number.isFinite(score)
  const p = hasScore ? clamp01(score) : null

  const aria = hasScore
    ? `Score ${pctLabel(p!)}, cutoff ${pctLabel(t, 2)}, uncertain band ${pctLabel(lo, 2)} to ${pctLabel(hi, 2)}`
    : `No score yet. Cutoff ${pctLabel(t, 2)}, uncertain band ${pctLabel(lo, 2)} to ${pctLabel(hi, 2)}`

  return (
    <div className={`confidence-bar${compact ? ' confidence-bar--compact' : ''}${className ? ` ${className}` : ''}`}>
      <div className="confidence-bar-label-row">
        <span className="label">Confidence (0–100%)</span>
        {hasScore && (
          <span className="confidence-bar-score-readout" aria-hidden="true">
            {pctLabel(p!)}
          </span>
        )}
      </div>

      <div className="confidence-bar-track" role="img" aria-label={aria}>
        <span
          className="confidence-bar-band"
          style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }}
          title={`Uncertain band ${lo.toFixed(4)}–${hi.toFixed(4)}`}
        />
        <span
          className="confidence-bar-cutoff"
          style={{ left: `${t * 100}%` }}
          title={`Cutoff ${t.toFixed(4)}`}
        />
        {p != null && (
          <span
            className="confidence-bar-marker"
            style={{ left: `${p * 100}%` }}
            title={`Score ${pctLabel(p)}`}
          />
        )}
        {p != null && <span className="confidence-bar-fill" style={{ width: `${p * 100}%` }} />}
      </div>

      <div className="confidence-bar-axis" aria-hidden="true">
        <span className="confidence-bar-tick confidence-bar-tick--0">0%</span>
        <span
          className="confidence-bar-tick confidence-bar-tick--cutoff"
          style={{ left: `${t * 100}%` }}
        >
          cutoff
        </span>
        <span className="confidence-bar-tick confidence-bar-tick--100">100%</span>
      </div>

      <div className="confidence-bar-legend" aria-hidden="true">
        <span className="confidence-bar-legend-item confidence-bar-legend-band">
          Uncertain band {lo.toFixed(4)}–{hi.toFixed(4)}
        </span>
        <span className="confidence-bar-legend-item">Cutoff {t.toFixed(4)}</span>
        {hasScore ? (
          <span className="confidence-bar-legend-item confidence-bar-legend-score">
            Score marker {pctLabel(p!)}
          </span>
        ) : (
          <span className="confidence-bar-legend-item muted">Score marker appears after scoring</span>
        )}
      </div>

      <p className="tiny muted confidence-bar-help">
        Horizontal scale from 0% (likely normal) to 100% (likely tumor). The shaded middle is the
        uncertain band from model settings. The vertical line is the decision cutoff.
      </p>
    </div>
  )
}
