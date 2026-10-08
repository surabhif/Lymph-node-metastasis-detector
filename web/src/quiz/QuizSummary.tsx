import type { QuizItem, UserAnswer } from './types'

type Props = {
  items: QuizItem[]
  answers: UserAnswer[]
  seed: number
  disclaimer: string
  baseUrl: string
  onRestart: () => void
  onReview: (index: number) => void
}

export default function QuizSummary({
  items,
  answers,
  seed,
  disclaimer,
  baseUrl,
  onRestart,
  onReview,
}: Props) {
  let you = 0
  let model = 0
  let agreed = 0
  let very = 0
  let veryOk = 0

  items.forEach((item, i) => {
    const a = answers[i]!
    const youOk = a.choice === item.label
    const modelChoice = item.verdict === 'uncertain' ? null : item.verdict
    const modelOk = modelChoice === item.label
    if (youOk) you += 1
    if (modelOk) model += 1
    if (modelChoice && a.choice === modelChoice) agreed += 1
    if (a.confidence === 'very') {
      very += 1
      if (youOk) veryOk += 1
    }
  })

  const link = `${typeof window !== 'undefined' ? window.location.pathname : '/quiz'}?seed=${seed}`

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}?seed=${seed}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="quiz-summary" aria-labelledby="quiz-summary-heading">
      <h2 id="quiz-summary-heading" tabIndex={-1}>
        Your results
      </h2>
      <div className="quiz-score-row">
        <div className="metric-card panel">
          <div className="label">You</div>
          <div className="value">
            {you}/{items.length}
          </div>
        </div>
        <div className="metric-card panel">
          <div className="label">Model</div>
          <div className="value">
            {model}/{items.length}
          </div>
        </div>
        <div className="metric-card panel">
          <div className="label">Agreed</div>
          <div className="value">{agreed}</div>
        </div>
      </div>

      <div className="quiz-thumbs">
        {items.map((item, i) => {
          const a = answers[i]!
          const youOk = a.choice === item.label
          const modelOk = item.verdict !== 'uncertain' && item.verdict === item.label
          return (
            <button
              key={item.id}
              type="button"
              className="quiz-thumb"
              onClick={() => onReview(i)}
              aria-label={`Review patch ${i + 1}`}
            >
              <img
                src={`${baseUrl}${item.src}`}
                alt=""
                width={64}
                height={64}
                style={{ imageRendering: 'pixelated' }}
              />
              <span className="quiz-thumb-marks">
                You {youOk ? '✓' : '✗'} · Model {modelOk ? '✓' : '✗'}
              </span>
            </button>
          )
        })}
      </div>

      <p className="muted">
        &ldquo;Very sure&rdquo; answers: {very}
        {very > 0 ? ` · of those correct: ${veryOk}` : ''}
      </p>

      <div className="quiz-summary-actions">
        <button type="button" className="btn" onClick={onRestart}>
          Try another set
        </button>
        <button type="button" className="btn secondary" onClick={() => void copyLink()}>
          Copy link to this set
        </button>
      </div>
      <p className="muted tiny">
        Seed <code>{seed}</code> · shareable as <code>{link}</code>
      </p>
      <p className="quiz-disclaimer" role="note">
        {disclaimer}
      </p>
    </section>
  )
}
