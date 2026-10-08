import { useEffect, useState } from 'react'

type ViewMode = 'baseline' | 'retrain' | 'side'

type FullRetrainStatus = {
  status: string
  label: string
  message: string
  metrics: null
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

export default function ResultsPage() {
  const [data, setData] = useState<Metrics | null>(null)
  const [stain, setStain] = useState<StainSummary | null>(null)
  const [retrain, setRetrain] = useState<FullRetrainStatus | null>(null)
  const [view, setView] = useState<ViewMode>('side')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const url = `${import.meta.env.BASE_URL}results/metrics.json`
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load ${url}`)
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
      .then((j: FullRetrainStatus | null) => setRetrain(j))
      .catch(() => setRetrain(null))
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

  return (
    <article className="fade-in results-page">
      <header className="page-intro">
        <h1 tabIndex={-1}>Results</h1>
        <p>
          <strong>{data.label}.</strong> {data.disclaimer}
        </p>
        <div className="results-view-toggle" role="tablist" aria-label="Results view">
          {(
            [
              ['baseline', 'Baseline (CPU subset)'],
              ['retrain', 'Full retrain (GPU)'],
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
          <h2 className="section-title">
            {retrain?.label ?? 'Full PCam GPU retrain'}
          </h2>
          <p className="retrain-banner">
            {retrain?.message ?? (
              <>
                <strong>Full retrain in progress.</strong> Metrics will appear after the
                official-split GPU run, calibration, and validation-chosen threshold are exported.
                No placeholder numbers.
              </>
            )}
          </p>
          <div className="metrics-grid muted-pending">
            <div className="metric-card panel">
              <div className="label">Test AUC</div>
              <div className="value">—</div>
            </div>
            <div className="metric-card panel">
              <div className="label">Accuracy @ t*</div>
              <div className="value">—</div>
            </div>
            <div className="metric-card panel">
              <div className="label">ECE (calibrated)</div>
              <div className="value">—</div>
            </div>
            <div className="metric-card panel">
              <div className="label">Uncertain band</div>
              <div className="value value-sm">—</div>
            </div>
          </div>
        </section>
      )}

      {showBaseline && (
        <>
          <h2 className="section-title baseline-heading">Baseline (CPU subset)</h2>
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
        <p className="muted tiny">Rows = true label · columns = predicted</p>
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
          Highest-confidence errors on the evaluation subset. These are a good place to stay humble:
          morphology can be ambiguous, stain can mislead, and a patch is not a patient. Review before
          writing conclusions.
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
                true {item.trueLabel} · pred {item.predictedLabel}
                <br />
                P={item.probability.toFixed(2)} · test #{item.testIndex}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {stain && (
        <section className="panel">
          <h2 className="section-title">Stain / colour robustness</h2>
          <p>
            <strong>{stain.label}.</strong> {stain.disclaimer} Held-out official-test subset (n=
            {stain.n}). Full write-up:{' '}
            <code>results/stain_robustness.md</code>.
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
                  <th scope="row">
                    <code>{r.perturbation}</code>
                  </th>
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
        <h2 className="section-title">Limitations (honest)</h2>
        <ul>
          <li>
            Metrics are from a fixed-seed <em>subset</em> of the official test split, not a claim of
            full-split or clinical AUROC.
          </li>
          <li>
            Colour / stain stress tests here use principled jitter and approximate H&amp;E RGB
            scaling — not Macenko/Vahadane or external labs.
          </li>
          <li>
            Patch-level scores are not whole-slide or patient-level decisions. Educational research
            only — not for clinical use.
          </li>
          <li>
            Full-PCam GPU retrain metrics are shown only when exported — never as placeholders.
          </li>
        </ul>
      </section>

      <section className="panel">
        <h2 className="section-title">Run configuration</h2>
        <pre className="config-block">{JSON.stringify(
          {
            config: data.config,
            subset_sizes: data.subset_sizes,
            model_artifact: data.model_artifact,
          },
          null,
          2,
        )}</pre>
      </section>

        </>
      )}
    </article>
  )
}
