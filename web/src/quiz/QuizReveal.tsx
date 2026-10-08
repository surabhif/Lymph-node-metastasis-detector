import { useState } from 'react'
import type { QuizItem, UserAnswer } from './types'

type Props = {
  item: QuizItem
  answer: UserAnswer
  baseUrl: string
  onNext: () => void
  isLast: boolean
}

export default function QuizReveal({ item, answer, baseUrl, onNext, isLast }: Props) {
  const [showCam, setShowCam] = useState(true)
  const youOk = answer.choice === item.label
  const modelOk =
    item.verdict === 'uncertain' ? false : item.verdict === item.label
  const modelText =
    item.verdict === 'uncertain'
      ? `${item.probability.toFixed(2)} → Uncertain`
      : `${item.probability.toFixed(2)} → ${item.verdict === 'tumor' ? 'Tumor' : 'Normal'}${modelOk ? ' ✓' : ' ✗'}`

  return (
    <section className="quiz-reveal" aria-labelledby="quiz-reveal-heading">
      <h2 id="quiz-reveal-heading" tabIndex={-1}>
        Reveal
      </h2>
      <div className="quiz-reveal-images">
        <figure>
          <img
            src={`${baseUrl}${item.src}`}
            alt={`Ground truth ${item.label} patch`}
            width={144}
            height={144}
            style={{ imageRendering: 'pixelated' }}
          />
          <figcaption>Patch</figcaption>
        </figure>
        {showCam && (
          <figure>
            <img
              src={`${baseUrl}${item.camSrc}`}
              alt={`Model CAM overlay for this ${item.label} patch`}
              width={144}
              height={144}
              style={{ imageRendering: 'pixelated' }}
            />
            <figcaption>Model CAM</figcaption>
          </figure>
        )}
      </div>
      <div className="quiz-reveal-card panel">
        <p>
          Truth: <strong>{item.label.toUpperCase()}</strong>
          {' · '}
          You: {answer.choice === 'tumor' ? 'Tumor' : 'Normal'} {youOk ? '✓' : '✗'}
          {' · '}
          Model: {modelText}
        </p>
        <p className="muted tiny">
          {modelOk
            ? 'The model agreed with the ground-truth centre label.'
            : item.verdict === 'uncertain'
              ? 'The model scored this patch in its uncertain band.'
              : 'The model missed this one — heatmaps show where it focused, which is not always the centre.'}
        </p>
      </div>
      <div className="quiz-reveal-actions">
        <button type="button" className="btn secondary" onClick={() => setShowCam((v) => !v)}>
          {showCam ? 'Hide heatmap' : 'Show heatmap'}
        </button>
        <button type="button" className="btn" onClick={onNext}>
          {isLast ? 'See results' : 'Next'} <kbd>Enter</kbd>
        </button>
      </div>
    </section>
  )
}
