import { useEffect, useState } from 'react'

type ViewMode = 'baseline' | 'retrain' | 'side'

type FullRetrainStatus = {
  status: string
  label: string
  message: string
  metrics_path?: string
  calibration?: {
    method: string
    a?: number
    b?: number
    formula?: string
    note?: string
  }
  threshold?: number
  uncertain_band?: { lo: number; hi: number }
  compared_to_baseline?: {
    baseline_label: string
    baseline_test_auc: number
    full_retrain_test_auc: number
    note: string
  }
}

type ReliabilityBin = {
  lo: number
  hi: number
  count: number
  mean_pred: number
  frac_pos: number
}

type FullRetrainMetrics = {
  model: string
  checkpoint_epoch: number
  best_val_auc_raw: number
  calibration: {
    chosen: string
    platt_a: number
    platt_b: number
    formula: string
    note: string
    compared: Record<string, { val_nll: number; val_ece15: number }>
  }
  threshold_youden_val: number
  uncertain_band_val: { lo: number; hi: number }
  test_uncertain: {
    flagged_frac: number
    selective_accuracy_outside_band: number
  }
  test_raw_at_0p5: {
    n: number
    auc: number
    accuracy: number
    sensitivity: number
    specificity: number
    ece15: number
    confusion: { tn: number; fp: number; fn: number; tp: number }
    reliability_bins_15: ReliabilityBin[]
  }
  test_calibrated_at_youden: {
    n: number
    threshold: number
    auc: number
    accuracy: number
    sensitivity: number
    specificity: number
    ece15: number
    confusion: { tn: number; fp: number; fn: number; tp: number }
    reliability_bins_15: ReliabilityBin[]
  }
  test_auc_bootstrap95: [number, number]
  onnx: {
    int8_mb: number
    fp32_mb: number
    int8_test_auc_raw: number
    int8_test_acc_raw_0p5: number
    int8_vs_torch_mean_abs_512: number
    note: string
  }
}

type Metrics = {
  label: string
  disclaimer: string
  surabhi_prompts?: string[]
  config: Record<string, unknown>
  subset_sizes: Record<string, unknown>
  metrics: {
    test_accuracy: number
    test_roc_auc: number
    test_roc_auc_bootstrap_95ci: [number, number]
    confusion_matrix: { labels: string[]; matrix: number[][]; row_means_true: boolean }
    decision_threshold: number
  }
  roc_curve: { fpr: number; tpr: number }[]
  calibration: {
    center: number
    mean_predicted: number
    fraction_positive: number
    count: number
  }[]
  mistakes: {
    src: string
    testIndex: number
    trueLabel: string
    predictedLabel: string
    probability: number
  }[]
  model_artifact?: Record<string, unknown>
}

type StainSummary = {
  label: string
  disclaimer: string
  n: number
  rows: {
    perturbation: string
    accuracy: number
    roc_auc: number
    delta_auc_vs_clean: number
  }[]
  plots: { auc: string; examples: string }
}

function RocChart({ points }: { points: Metrics['roc_curve'] }) {
  const w = 320
  const h = 240
  const pad = 36
  const innerW = w - pad * 2
  const innerH = h - pad * 2
  const path = points
    .map((p, i) => {
      const x = pad + p.fpr * innerW
      const y = pad + (1 - p.tpr) * innerH
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" role="img" aria-label="ROC curve">
      <rect x={pad} y={pad} width={innerW} height={innerH} fill="rgba(255,255,255,0.5)" stroke="var(--line)" />
      <line
        x1={pad}
        y1={pad + innerH}
        x2={pad + innerW}
        y2={pad}
        stroke="var(--muted)"
        strokeDasharray="4 4"
      />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      <text x={w / 2} y={h - 8} textAnchor="middle" className="chart-axis">
        False positive rate
      </text>
      <text
        x={14}
        y={h / 2}
        textAnchor="middle"
        className="chart-axis"
        transform={`rotate(-90 14 ${h / 2})`}
      >
        True positive rate
      </text>
    </svg>
  )
}

function CalibrationChart({ bins }: { bins: Metrics['calibration'] }) {
  const w = 320
  const h = 240
  const pad = 36
  const innerW = w - pad * 2
  const innerH = h - pad * 2
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart-svg" role="img" aria-label="Reliability diagram">
      <rect x={pad} y={pad} width={innerW} height={innerH} fill="rgba(255,255,255,0.5)" stroke="var(--line)" />
      <line
        x1={pad}
        y1={pad + innerH}
        x2={pad + innerW}
        y2={pad}
        stroke="var(--muted)"
        strokeDasharray="4 4"
      />
      {bins.map((b) => {
        const x = pad + b.mean_predicted * innerW
        const y = pad + (1 - b.fraction_positive) * innerH
        return <circle key={`${b.center}-${b.count}`} cx={x} cy={y} r={5} fill="var(--accent)" />
      })}
      <text x={w / 2} y={h - 8} textAnchor="middle" className="chart-axis">
        Mean predicted probability
      </text>
      <text
        x={14}
        y={h / 2}
        textAnchor="middle"
        className="chart-axis"
        transform={`rotate(-90 14 ${h / 2})`}
      >
        Observed frequency
      </text>
    </svg>
  )
}

/** Bar reliability diagram from full-retrain metrics bins (site accent style). */
function ReliabilityBars({
  bins,
  title,
  ece,
}: {
  bins: ReliabilityBin[]
  title: string
  ece: number
}) {
  const w = 360
  const h = 260
  const padL = 44
  const padR = 16
  const padT = 28
  const padB = 40
  const innerW = w - padL - padR
  const innerH = h - padT - padB
  const n = bins.length
  const gap = 2
  const barW = Math.max(2, (innerW - gap * (n - 1)) / n)

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="chart-svg"
      role="img"
      aria-label={`${title}, ECE ${ece.toFixed(3)}`}
    >
      <text x={padL} y={18} className="chart-axis" style={{ fontSize: 12, fill: 'var(--ink)' }}>
        {title}, ECE={ece.toFixed(3)}
      </text>
      <rect
        x={padL}
        y={padT}
        width={innerW}
        height={innerH}
        fill="rgba(255,255,255,0.5)"
        stroke="var(--line)"
      />
      <line
        x1={padL}
        y1={padT + innerH}
        x2={padL + innerW}
        y2={padT}
        stroke="var(--muted)"
        strokeDasharray="4 4"
      />
      {bins.map((b, i) => {
        const x = padL + i * (barW + gap)
        const barH = Math.max(0, b.frac_pos * innerH)
        const y = padT + innerH - barH
        return (
          <rect
            key={`${b.lo}-${b.hi}`}
            x={x}
            y={y}
            width={barW}
            height={barH}
            fill="var(--accent)"
            opacity={0.85}
          >
            <title>
              [{b.lo.toFixed(2)}, {b.hi.toFixed(2)}] mean_pred={b.mean_pred.toFixed(3)} frac=
              {b.frac_pos.toFixed(3)} n={b.count}
            </title>
          </rect>
        )
      })}
      <text x={padL + innerW / 2} y={h - 10} textAnchor="middle" className="chart-axis">
        predicted P(tumor)
      </text>
      <text
        x={14}
        y={padT + innerH / 2}
        textAnchor="middle"
        className="chart-axis"
        transform={`rotate(-90 14 ${padT + innerH / 2})`}
      >
        fraction tumor
      </text>
    </svg>
  )
}

function pct(x: number, digits = 2): string {
  return `${(x * 100).toFixed(digits)}%`
}

const STAIN_PERTURBATION_LABELS: Record<string, string> = {
  clean: 'Clean (no change)',
  mild_color_jitter: 'Mild colour jitter',
  strong_color_jitter: 'Strong colour jitter',
  he_channel_scale: 'H&E channel scaling',
  hue_shift_warm: 'Warm hue shift',
  hue_shift_cool: 'Cool hue shift',
}

function stainPerturbationLabel(id: string): string {
  return STAIN_PERTURBATION_LABELS[id] ?? id.replace(/_/g, ' ')
}

export default function ResultsPage() {
  const [data, setData] = useState<Metrics | null>(null)
  const [stain, setStain] = useState<StainSummary | null>(null)
  const [retrain, setRetrain] = useState<FullRetrainStatus | null>(null)
  const [full, setFull] = useState<FullRetrainMetrics | null>(null)
  const [view, setView] = useState<ViewMode>('retrain')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}results/metrics.json`
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('Could not load results metrics')
        return r.json()
      })
      .then((j: Metrics) => setData(j))
      .catch((e: Error) => setError(e.message))

    fetch(`${import.meta.env.BASE_URL}results/stain_robustness_summary.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: StainSummary | null) => setStain(j))
      .catch(() => setStain(null))

    fetch(`${import.meta.env.BASE_URL}results/full_retrain_status.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: FullRetrainStatus | null) => {
        setRetrain(j)
        const path = j?.metrics_path ?? 'results/full_retrain_metrics.json'
        return fetch(`${import.meta.env.BASE_URL}${path}`).then((r) => (r.ok ? r.json() : null))
      })
      .then((j: FullRetrainMetrics | null) => setFull(j))
      .catch(() => {
        setRetrain(null)
        setFull(null)
      })
  }, [])

  if (error) {
    return (
      <article className="panel prose fade-in">
        <h1 tabIndex={-1}>Results</h1>
        <p className="error-text" role="alert">
          {error}
        </p>
      </article>
    )
  }

  if (!data) {
    return (
      <article className="panel prose fade-in">
        <h1 tabIndex={-1}>Results</h1>
        <p className="muted">Loading metrics…</p>
      </article>
    )
  }

  const m = data.metrics
  const cm = m.confusion_matrix.matrix
  const labels = m.confusion_matrix.labels

  const showBaseline = view === 'baseline' || view === 'side'
  const showRetrain = view === 'retrain' || view === 'side'
  const cal = full?.test_calibrated_at_youden
  const raw = full?.test_raw_at_0p5
  const onnx = full?.onnx

  return (
    <article className="fade-in results-page">
      <header className="page-intro">
        <h1 tabIndex={-1}>Results</h1>
        <p>
          <strong>
            {retrain?.label ?? 'Full PCam retrain'} is the live model
            {full ? ` (test AUC ${full.test_calibrated_at_youden.auc.toFixed(4)}, n=32,768)` : ''}
            .
          </strong>{' '}
          {retrain?.message ??
            'Trained on all 262,144 official train patches; evaluated on the full official test set. Educational research only, not for clinical use.'}{' '}
          An earlier <strong>{data.label}</strong> (8k-sample test eval) is kept below for
          side-by-side comparison only. It is not what the demo downloads.
        </p>
        <div className="results-view-toggle" role="tablist" aria-label="Results view">
          {(
            [
              ['retrain', 'Full retrain (live)'],
              ['baseline', 'Baseline (CPU subset)'],
              ['side', 'Side by side'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              className={`results-tab${view === id ? ' active' : ''}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {showRetrain && (
        <section className="panel retrain-status" aria-live="polite">
          <h2 className="section-title">{retrain?.label ?? 'Full PCam retrain'}</h2>
          <p className="retrain-banner">
            {retrain?.message ??
              'Full-PCam retrain metrics for the live model. Educational research only.'}
          </p>

          {full && cal && raw && onnx ? (
            <>
              <div className="metrics-grid">
                <div className="metric-card panel">
                  <div className="label">Test AUC</div>
                  <div className="value">{cal.auc.toFixed(4)}</div>
                  <p className="muted tiny">
                    95% CI [{full.test_auc_bootstrap95[0].toFixed(4)},{' '}
                    {full.test_auc_bootstrap95[1].toFixed(4)}], n={cal.n.toLocaleString()}
                  </p>
                </div>
                <div className="metric-card panel">
                  <div className="label">Accuracy at threshold {cal.threshold.toFixed(4)}</div>
                  <div className="value">{pct(cal.accuracy)}</div>
                  <p className="muted tiny">
                    Sensitivity {pct(cal.sensitivity)}, specificity {pct(cal.specificity)}{' '}
                    (calibrated)
                  </p>
                </div>
                <div className="metric-card panel">
                  <div className="label">ECE (calibrated)</div>
                  <div className="value">{cal.ece15.toFixed(4)}</div>
                  <p className="muted tiny">Raw at 0.5: ECE {raw.ece15.toFixed(4)}</p>
                </div>
                <div className="metric-card panel">
                  <div className="label">Uncertain band</div>
                  <div className="value value-sm">
                    {full.uncertain_band_val.lo.toFixed(4)}–{full.uncertain_band_val.hi.toFixed(4)}
                  </div>
                  <p className="muted tiny">
                    Flags {pct(full.test_uncertain.flagged_frac, 1)} of test;{' '}
                    {pct(full.test_uncertain.selective_accuracy_outside_band, 1)} accuracy outside
                    the band
                  </p>
                </div>
              </div>

              <div className="metrics-grid" style={{ marginTop: '1rem' }}>
                <div className="metric-card panel">
                  <div className="label">Raw at threshold 0.5</div>
                  <div className="value value-sm">
                    Acc {pct(raw.accuracy)}, sens {pct(raw.sensitivity)}, spec{' '}
                    {pct(raw.specificity)}
                  </div>
                </div>
                <div className="metric-card panel">
                  <div className="label">INT8 ONNX vs PyTorch</div>
                  <div className="value value-sm">
                    AUC {onnx.int8_test_auc_raw.toFixed(4)} / acc{' '}
                    {pct(onnx.int8_test_acc_raw_0p5)} at 0.5
                  </div>
                  <p className="muted tiny">
                    Served file is INT8 ({onnx.int8_mb.toFixed(1)} MB) vs FP32 (
                    {onnx.fp32_mb.toFixed(1)} MB). PyTorch test AUC {cal.auc.toFixed(4)}. Mean
                    absolute score difference on 512 patches:{' '}
                    {onnx.int8_vs_torch_mean_abs_512.toFixed(4)}.
                  </p>
                </div>
                <div className="metric-card panel">
                  <div className="label">Calibration</div>
                  <div className="value value-sm">
                    Platt scaling (chosen on validation)
                  </div>
                  <p className="muted tiny">
                    Parameters a={full.calibration.platt_a.toFixed(5)}, b=
                    {full.calibration.platt_b.toFixed(5)}. See the Model card for the formula.
                  </p>
                </div>
                <div className="metric-card panel">
                  <div className="label">Checkpoint</div>
                  <div className="value value-sm">
                    Epoch {full.checkpoint_epoch}, val AUC {full.best_val_auc_raw.toFixed(4)}
                  </div>
                  <p className="muted tiny">8 epochs CPU bf16; best by val AUC</p>
                </div>
              </div>

              <section className="charts-grid" style={{ marginTop: '1.25rem' }}>
                <div className="panel">
                  <h3 className="section-title">Reliability diagram (raw)</h3>
                  <ReliabilityBars
                    bins={raw.reliability_bins_15}
                    title="Raw (test)"
                    ece={raw.ece15}
                  />
                </div>
                <div className="panel">
                  <h3 className="section-title">Reliability diagram (Platt calibrated)</h3>
                  <ReliabilityBars
                    bins={cal.reliability_bins_15}
                    title="Calibrated: platt (test)"
                    ece={cal.ece15}
                  />
                </div>
              </section>

              <section className="panel" style={{ marginTop: '1.25rem' }}>
                <h3 className="section-title">Confusion matrix (calibrated at threshold)</h3>
                <p className="muted tiny">
                  Full official test set (n={cal.n.toLocaleString()}). TP {cal.confusion.tp.toLocaleString()}{' '}
                  / FN {cal.confusion.fn.toLocaleString()} / FP {cal.confusion.fp.toLocaleString()} / TN{' '}
                  {cal.confusion.tn.toLocaleString()}.
                </p>
                <table className="cm-table">
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
                      <td>{cal.confusion.tn.toLocaleString()}</td>
                      <td>{cal.confusion.fp.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <th scope="row">true tumor</th>
                      <td>{cal.confusion.fn.toLocaleString()}</td>
                      <td>{cal.confusion.tp.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              {retrain?.compared_to_baseline && (
                <p className="muted tiny" style={{ marginTop: '1rem' }}>
                  vs baseline: {retrain.compared_to_baseline.note} Baseline test AUC ≈{' '}
                  {retrain.compared_to_baseline.baseline_test_auc.toFixed(4)}; full retrain{' '}
                  {retrain.compared_to_baseline.full_retrain_test_auc.toFixed(4)}.
                </p>
              )}

              <p className="muted tiny">
                Val–test gap: best val AUC {full.best_val_auc_raw.toFixed(4)} vs test AUC{' '}
                {cal.auc.toFixed(4)}. Numbers match the live-model Results run. Educational research
                only, not for clinical use.
              </p>
            </>
          ) : (
            <p className="muted">Loading full-retrain metrics…</p>
          )}
        </section>
      )}

      {showBaseline && (
        <>
          <h2 className="section-title baseline-heading">Baseline (CPU subset)</h2>
          <p className="muted tiny">
            Older subset-trained model evaluated on a fixed-seed 8,000-patch official-test subset.
            Kept for side-by-side comparison. The live demo serves the full-PCam retrain.
          </p>
          <section className="metrics-grid">
            <div className="metric-card panel">
              <div className="label">Test accuracy</div>
              <div className="value">{(m.test_accuracy * 100).toFixed(2)}%</div>
            </div>
            <div className="metric-card panel">
              <div className="label">ROC-AUC</div>
              <div className="value">{m.test_roc_auc.toFixed(4)}</div>
            </div>
            <div className="metric-card panel">
              <div className="label">AUC 95% bootstrap CI</div>
              <div className="value value-sm">
                [{m.test_roc_auc_bootstrap_95ci[0].toFixed(4)},{' '}
                {m.test_roc_auc_bootstrap_95ci[1].toFixed(4)}]
              </div>
            </div>
            <div className="metric-card panel">
              <div className="label">Threshold</div>
              <div className="value">{m.decision_threshold}</div>
            </div>
          </section>

          <section className="charts-grid">
            <div className="panel">
              <h2 className="section-title">ROC curve</h2>
              <RocChart points={data.roc_curve} />
            </div>
            <div className="panel">
              <h2 className="section-title">Reliability diagram</h2>
              <CalibrationChart bins={data.calibration} />
            </div>
          </section>

          <section className="panel">
            <h2 className="section-title">Confusion matrix</h2>
            <p className="muted tiny">Rows = true label; columns = predicted</p>
            <table className="cm-table">
              <thead>
                <tr>
                  <th scope="col" />
                  {labels.map((l) => (
                    <th key={l} scope="col">
                      pred {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cm.map((row, i) => (
                  <tr key={labels[i]}>
                    <th scope="row">true {labels[i]}</th>
                    {row.map((v, j) => (
                      <td key={`${i}-${j}`}>{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2 className="section-title">Confident mistakes</h2>
            <p className="muted">
              Highest-confidence errors on the evaluation subset. Tissue patterns can be ambiguous,
              stain can mislead, and a patch is not a patient. Review these before drawing
              conclusions.
            </p>
            <div className="mistakes-grid">
              {data.mistakes.map((item) => (
                <figure key={item.src} className="mistake-card">
                  <img
                    src={`${import.meta.env.BASE_URL}${item.src}`}
                    alt={`Mistake test index ${item.testIndex}`}
                    width={96}
                    height={96}
                  />
                  <figcaption>
                    true {item.trueLabel}, pred {item.predictedLabel}
                    <br />
                    score {item.probability.toFixed(2)}, test #{item.testIndex}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>

          {stain && (
            <section className="panel">
              <h2 className="section-title">Stain and colour checks</h2>
              <p>
                <strong>{stain.label}.</strong> {stain.disclaimer} Held-out official-test subset (n=
                {stain.n}). Plots and table below summarize the checks.
              </p>
              <div className="stain-plots">
                <figure>
                  <img
                    src={`${import.meta.env.BASE_URL}${stain.plots.auc}`}
                    alt="ROC-AUC under colour and stain-like perturbations"
                  />
                </figure>
                <figure>
                  <img
                    src={`${import.meta.env.BASE_URL}${stain.plots.examples}`}
                    alt="Example clean versus strong colour-jitter patches"
                  />
                </figure>
              </div>
              <table className="cm-table">
                <thead>
                  <tr>
                    <th scope="col">Perturbation</th>
                    <th scope="col">Accuracy</th>
                    <th scope="col">ROC-AUC</th>
                    <th scope="col">Δ AUC vs clean</th>
                  </tr>
                </thead>
                <tbody>
                  {stain.rows.map((r) => (
                    <tr key={r.perturbation}>
                      <th scope="row">{stainPerturbationLabel(r.perturbation)}</th>
                      <td>{(r.accuracy * 100).toFixed(2)}%</td>
                      <td>{r.roc_auc.toFixed(4)}</td>
                      <td>
                        {r.delta_auc_vs_clean >= 0 ? '+' : ''}
                        {r.delta_auc_vs_clean.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section className="panel">
            <h2 className="section-title">Limitations</h2>
            <ul>
              <li>
                Baseline metrics are from a fixed-seed <em>subset</em> of the official test split
                (8k patches), not the full 32,768-patch test set.
              </li>
              <li>
                Colour / stain stress tests here use principled jitter and approximate H&amp;E RGB
                scaling, not Macenko/Vahadane or external labs.
              </li>
              <li>
                Patch-level scores are not whole-slide or patient-level decisions. Educational
                research only, not for clinical use.
              </li>
              <li>
                The live demo serves the full-PCam retrain (see Full retrain tab); INT8 export is
                slightly below PyTorch AUC on the same split.
              </li>
            </ul>
          </section>

          <section className="panel">
            <h2 className="section-title">Run configuration</h2>
            <pre className="config-block">
              {JSON.stringify(
                {
                  config: data.config,
                  subset_sizes: data.subset_sizes,
                  model_artifact: data.model_artifact,
                },
                null,
                2,
              )}
            </pre>
          </section>
        </>
      )}
    </article>
  )
}
