import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SlideViewer, { type RegionMeta } from '../slide/SlideViewer'

type IndexFile = {
  regions: { id: string; title: string; path: string }[]
  note?: string
}

const BASE = import.meta.env.BASE_URL

export default function SlidePage() {
  const [params, setParams] = useSearchParams()
  const [index, setIndex] = useState<IndexFile | null>(null)
  const [meta, setMeta] = useState<RegionMeta | null>(null)
  const [error, setError] = useState<string | null>(null)

  const regionId = params.get('region') ?? 'pseudo-metastasis-a'

  useEffect(() => {
    void fetch(`${BASE}slides/index.json`)
      .then((r) => {
        if (!r.ok) throw new Error('Could not load slides/index.json')
        return r.json()
      })
      .then((j: IndexFile) => setIndex(j))
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!index) return
    const entry = index.regions.find((r) => r.id === regionId) ?? index.regions[0]
    if (!entry) {
      setError('No slide regions available')
      return
    }
    void fetch(`${BASE}${entry.path}meta.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Missing meta for ${entry.id}`)
        return r.json()
      })
      .then((m: RegionMeta) => setMeta({ ...m, title: entry.title }))
      .catch((e: Error) => setError(e.message))
  }, [index, regionId])

  return (
    <div className="fade-in slide-page">
      <header className="page-intro">
        <h1 tabIndex={-1}>Slide heatmap viewer</h1>
        <p>
          Educational visualisation of a patch classifier swept across a region. Not a diagnostic
          viewer. Source patches are CC0 PatchCamelyon / CAMELYON16 material — see CREDITS.
        </p>
        {index && (
          <div className="results-view-toggle" role="radiogroup" aria-label="Slide region">
            {index.regions.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`results-tab${regionId === r.id ? ' active' : ''}`}
                aria-checked={regionId === r.id}
                role="radio"
                onClick={() => setParams({ region: r.id })}
              >
                {r.title}
              </button>
            ))}
          </div>
        )}
        {index?.note && <p className="muted tiny">{index.note}</p>}
      </header>

      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}

      {meta && index && (
        <SlideViewer
          key={meta.id}
          baseUrl={BASE}
          regionPath={index.regions.find((r) => r.id === meta.id)?.path ?? `slides/${meta.id}/`}
          meta={meta}
        />
      )}
    </div>
  )
}
