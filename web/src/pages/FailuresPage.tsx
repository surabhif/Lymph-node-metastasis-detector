import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'

type FailureItem = {
  kind: 'fn' | 'fp'
  testIndex: number
  trueLabel: string
  score: number
  threshold: number
  patch: string
  heatmap: string
  captionPlaceholder: string
}

type FailureGallery = {
  model_version: string
  threshold: number
  n_false_negatives: number
  n_false_positives: number
  selection: string
  credit: string
  disclaimer: string
  items: FailureItem[]
}

export default function FailuresPage() {
  const [data, setData] = useState<FailureGallery | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}results/failure_gallery.json`)
      .then((r) => {
        if (!r.ok) throw new Error('Could not load failure gallery')
        return r.json()
      })
      .then((j: FailureGallery) => setData(j))
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) {
    return (
      <article className="panel prose fade-in">
        <h1 tabIndex={-1}>Where the model was wrong</h1>
        <p className="error-text" role="alert">
          {error}
        </p>
      </article>
    )
  }

  if (!data) {
    return (
      <article className="panel prose fade-in">
        <h1 tabIndex={-1}>Where the model was wrong</h1>
        <p className="muted">Loading…</p>
      </article>
    )
  }

  const fns = data.items.filter((i) => i.kind === 'fn')
  const fps = data.items.filter((i) => i.kind === 'fp')

  return (
    <article className="fade-in failures-page">
      <header className="page-intro">
        <h1 tabIndex={-1}>Where the model was wrong</h1>
        <p>
          A look at patches the live model got wrong with high confidence on the official PCam
          test set. Educational research only, not for clinical use.{' '}
          <NavLink to="/results">Back to Results</NavLink>
        </p>
      </header>

      <section className="panel prose">
        <h2 className="section-title">What these mistakes mean</h2>
        <p>
          A <strong>false negative</strong> is a true tumor patch that the model scored as normal
          (below the decision cutoff). A <strong>false positive</strong> is a true normal patch that
          the model scored as tumor. In metastasis screening, a missed tumor (false negative)
          matters because cancer that has spread to a lymph node can change surgery and treatment
          plans — so overlooking it is especially costly. False positives also matter: they waste
          review time and can raise alarm without disease in that patch.
        </p>
        <p className="muted tiny">
          {data.selection} Cutoff {data.threshold.toFixed(4)}. Model {data.model_version}.{' '}
          {data.disclaimer}
        </p>
      </section>

      <FailureGroup
        title="Most confident false negatives (missed tumors)"
        blurb="True label: tumor. The model gave these the lowest scores among misses — it was sure they looked normal."
        items={fns}
      />

      <FailureGroup
        title="Most confident false positives (false alarms)"
        blurb="True label: normal. The model gave these the highest scores among false alarms — it was sure they looked like tumor."
        items={fps}
      />

      <p className="muted tiny" style={{ marginTop: '1rem' }}>
        {data.credit}
      </p>
    </article>
  )
}

function FailureGroup({
  title,
  blurb,
  items,
}: {
  title: string
  blurb: string
  items: FailureItem[]
}) {
  return (
    <section className="panel" style={{ marginTop: '1.25rem' }}>
      <h2 className="section-title">{title}</h2>
      <p className="muted">{blurb}</p>
      <div className="failure-grid">
        {items.map((item) => (
          <figure key={`${item.kind}-${item.testIndex}`} className="failure-card">
            <div className="failure-imgs">
              <img
                src={`${import.meta.env.BASE_URL}${item.patch}`}
                alt={`PCam test patch ${item.testIndex}, true ${item.trueLabel}`}
                width={96}
                height={96}
                loading="lazy"
              />
              <img
                src={`${import.meta.env.BASE_URL}${item.heatmap}`}
                alt={`Heatmap overlay for test patch ${item.testIndex}`}
                width={96}
                height={96}
                loading="lazy"
              />
            </div>
            <figcaption>
              <span className="failure-meta">
                True {item.trueLabel} · score {item.score.toFixed(4)} · test #{item.testIndex}
              </span>
              <span className="failure-caption-placeholder">{item.captionPlaceholder}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
