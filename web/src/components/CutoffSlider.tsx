import { useEffect, useId, useMemo, useState } from 'react'

type CutoffRow = {
  t: number
  tp: number
  fn: number
  tn: number
  fp: number
  sensitivity: number
  specificity: number
}

type CutoffTable = {
  model_version: string
  n: number
  n_tumor: number
  n_normal: number
  auc: number
  chosen_threshold: number
  uncertain_band: { lo: number; hi: number }
  chosen: CutoffRow
  step: number
  rows: CutoffRow[]
  note: string
}

function pct(x: number, digits = 1): string {
  return `${(x * 100).toFixed(digits)}%`
}

function nearestRow(rows: CutoffRow[], t: number): CutoffRow {
  let best = rows[0]!
  let bestD = Math.abs(best.t - t)
  for (const r of rows) {
    const d = Math.abs(r.t - t)
    if (d < bestD) {
      best = r
      bestD = d
    }
  }
  return best
}

export default function CutoffSlider() {
  const [table, setTable] = useState<CutoffTable | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cutoff, setCutoff] = useState(0.52)
  const labelId = useId()
  const helpId = useId()

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}results/cutoff_table.json`)
      .then((r) => {
        if (!r.ok) throw new Error('Could not load cutoff table')
        return r.json()
      })
      .then((j: CutoffTable) => {
        setTable(j)
        setCutoff(Number(j.chosen_threshold.toFixed(2)))
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const live = useMemo(() => {
    if (!table) return null
    // Prefer exact chosen metrics when slider is at the marked cutoff
    if (Math.abs(cutoff - table.chosen_threshold) < 0.005) return table.chosen
    return nearestRow(table.rows, cutoff)
  }, [table, cutoff])

  if (error) {
    return (
      <p className="error-text" role="alert">
        {error}
      </p>
    )
  }
  if (!table || !live) {
    return <p className="muted">Loading cutoff explorer…</p>
  }

  const inBand = cutoff >= table.uncertain_band.lo && cutoff <= table.uncertain_band.hi
  const atChosen = Math.abs(cutoff - table.chosen_threshold) < 0.005

  return (
    <div className="cutoff-explorer">
      <h3 className="section-title" id={labelId}>
        Decision cutoff explorer
      </h3>
      <p className="muted" id={helpId}>
        Move the cutoff to trade catching more tumors (higher sensitivity) against fewer false
        alarms (higher specificity). Counts are from the live INT8 model on the full official test
        set (n={table.n.toLocaleString()}), after Platt calibration — not the raw 32k score list.
      </p>

      <div className="cutoff-slider-wrap">
        <label className="cutoff-slider-label" htmlFor={`${labelId}-range`}>
          Cutoff: <strong>{cutoff.toFixed(2)}</strong>
          {atChosen ? ' (chosen)' : ''}
          {inBand ? ' · inside uncertain band' : ''}
        </label>
        <input
          id={`${labelId}-range`}
          type="range"
          min={0}
          max={1}
          step={table.step}
          value={cutoff}
          aria-labelledby={labelId}
          aria-describedby={helpId}
          aria-valuetext={`Cutoff ${cutoff.toFixed(2)}. Sensitivity ${pct(live.sensitivity)}. Specificity ${pct(live.specificity)}. Missed tumors ${live.fn}. False alarms ${live.fp}.`}
          onChange={(e) => setCutoff(Number(e.target.value))}
        />
        <div className="cutoff-marks" aria-hidden="true">
          <span>0</span>
          <span
            className="cutoff-mark-band"
            style={{
              left: `${table.uncertain_band.lo * 100}%`,
              width: `${(table.uncertain_band.hi - table.uncertain_band.lo) * 100}%`,
            }}
            title={`Uncertain band ${table.uncertain_band.lo.toFixed(4)}–${table.uncertain_band.hi.toFixed(4)}`}
          />
          <span
            className="cutoff-mark-chosen"
            style={{ left: `${table.chosen_threshold * 100}%` }}
            title={`Chosen cutoff ${table.chosen_threshold.toFixed(4)}`}
          />
          <span>1</span>
        </div>
        <p className="muted tiny cutoff-legend">
          Marked: chosen cutoff {table.chosen_threshold.toFixed(4)}; uncertain band{' '}
          {table.uncertain_band.lo.toFixed(4)}–{table.uncertain_band.hi.toFixed(4)}.
        </p>
      </div>

      <div className="cutoff-metrics" role="status" aria-live="polite">
        <div className="cutoff-metric">
          <span className="label">Sensitivity</span>
          <span className="value">{pct(live.sensitivity)}</span>
          <span className="muted tiny">tumors caught</span>
        </div>
        <div className="cutoff-metric">
          <span className="label">Specificity</span>
          <span className="value">{pct(live.specificity)}</span>
          <span className="muted tiny">normals correctly cleared</span>
        </div>
        <div className="cutoff-metric">
          <span className="label">Missed tumors</span>
          <span className="value">{live.fn.toLocaleString()}</span>
          <span className="muted tiny">false negatives</span>
        </div>
        <div className="cutoff-metric">
          <span className="label">False alarms</span>
          <span className="value">{live.fp.toLocaleString()}</span>
          <span className="muted tiny">false positives</span>
        </div>
      </div>

      <table className="cm-table cutoff-cm">
        <caption className="sr-only">Confusion counts at the selected cutoff</caption>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">pred normal</th>
            <th scope="col">pred tumor</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">true normal</th>
            <td>{live.tn.toLocaleString()}</td>
            <td>{live.fp.toLocaleString()}</td>
          </tr>
          <tr>
            <th scope="row">true tumor</th>
            <td>{live.fn.toLocaleString()}</td>
            <td>{live.tp.toLocaleString()}</td>
          </tr>
        </tbody>
      </table>

      <p className="muted tiny" style={{ marginTop: '0.75rem' }}>
        The slider uses the smaller in-browser version of the model, so its numbers at the 0.5201
        cutoff (80.4% sensitivity, 92.7% specificity) differ slightly from the full model&apos;s
        results above.
      </p>
      <p className="muted tiny">{table.note}</p>
    </div>
  )
}
