import { useId, useState } from 'react'
import { SITE, CITATION } from '../lib/constants'

type Format = 'apa' | 'bibtex' | 'cff'

function buildCite(format: Format): string {
  const { author, year, title, version, url } = CITATION
  if (format === 'apa') {
    return `${author} (${year}). ${title} (Version ${version}) [Web application]. ${url}`
  }
  if (format === 'bibtex') {
    return `@misc{fadnavis${year}lnm,
  author = {${author}},
  title  = {${title}},
  year   = {${year}},
  version = {${version}},
  howpublished = {\\url{${url}}},
  note   = {Research demo; not for clinical use}
}`
  }
  return `cff-version: 1.2.0
title: "${title}"
message: "If you use this software, please cite it as below."
type: software
authors:
  - family-names: Fadnavis
    given-names: Surabhi
version: "${version}"
date-released: "${CITATION.dateReleased}"
url: "${url}"
`
}

export default function CiteBox() {
  const [format, setFormat] = useState<Format>('apa')
  const [copied, setCopied] = useState(false)
  const liveId = useId()
  const text = buildCite(format)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      const area = document.getElementById('cite-text') as HTMLTextAreaElement | null
      area?.select()
      setCopied(false)
    }
  }

  return (
    <section className="cite-box" id="cite" aria-labelledby="cite-heading">
      <div className="cite-box-head">
        <h2 id="cite-heading">Cite this project</h2>
        <div className="cite-tabs" role="tablist" aria-label="Citation format">
          {(['apa', 'bibtex', 'cff'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={format === f}
              className={`cite-tab${format === f ? ' active' : ''}`}
              onClick={() => setFormat(f)}
            >
              {f === 'apa' ? 'APA' : f === 'bibtex' ? 'BibTeX' : 'CFF'}
            </button>
          ))}
        </div>
      </div>
      <textarea
        id="cite-text"
        className="cite-block"
        readOnly
        rows={format === 'cff' ? 10 : format === 'bibtex' ? 8 : 4}
        value={text}
        aria-label={`${format} citation`}
      />
      <div className="cite-box-foot">
        <p className="muted tiny">
          Also cite: Veeling et al. 2018 (PCam) · Bejnordi et al. 2017 (CAMELYON16). Version{' '}
          {CITATION.version} · {SITE.shortTitle}.
        </p>
        <button type="button" className="btn secondary" onClick={() => void copy()}>
          Copy
        </button>
      </div>
      <p id={liveId} className="sr-only" aria-live="polite">
        {copied ? 'Citation copied to clipboard' : ''}
      </p>
    </section>
  )
}
