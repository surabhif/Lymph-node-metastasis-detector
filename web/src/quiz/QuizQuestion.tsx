import type { Confidence, QuizItem, UserAnswer } from './types'

type Props = {
  item: QuizItem
  index: number
  total: number
  draft: Partial<UserAnswer>
  onDraft: (a: Partial<UserAnswer>) => void
  baseUrl: string
}

export default function QuizQuestion({ item, index, total, draft, onDraft, baseUrl }: Props) {
  const choice = draft.choice
  const confidence = draft.confidence ?? 'fairly'

  return (
    <section className="quiz-question" aria-labelledby="quiz-q-heading">
      <div className="quiz-progress-row">
        <h2 id="quiz-q-heading" tabIndex={-1}>
          Patch {index + 1} / {total}
        </h2>
        <div className="quiz-dots" aria-hidden="true">
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} className={`quiz-dot${i <= index ? ' on' : ''}`} />
          ))}
        </div>
      </div>

      <div className="quiz-patch-wrap">
        <img
          className="quiz-patch"
          src={`${baseUrl}${item.src}`}
          alt="H&E-stained lymph-node tissue patch. Label refers to the dashed centre square."
          width={288}
          height={288}
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="quiz-center-box" aria-hidden="true" />
      </div>
      <p className="muted tiny quiz-center-hint">The label refers to the dashed centre square.</p>

      <div className="quiz-choice-row" role="group" aria-label="Your label">
        <button
          type="button"
          className={`btn secondary${choice === 'normal' ? ' active-choice' : ''}`}
          onClick={() => onDraft({ choice: 'normal', confidence })}
          aria-pressed={choice === 'normal'}
        >
          Normal <kbd>N</kbd>
        </button>
        <button
          type="button"
          className={`btn${choice === 'tumor' ? ' active-choice' : ''}`}
          onClick={() => onDraft({ choice: 'tumor', confidence })}
          aria-pressed={choice === 'tumor'}
        >
          Tumor <kbd>T</kbd>
        </button>
      </div>

      <fieldset className="quiz-confidence">
        <legend>How sure? {choice ? '' : '(pick Tumor or Normal first)'}</legend>
        {(
          [
            ['guess', 'Guess', '1'],
            ['fairly', 'Fairly', '2'],
            ['very', 'Very', '3'],
          ] as const
        ).map(([val, label, key]) => (
          <label key={val} className="quiz-conf-option">
            <input
              type="radio"
              name="quiz-confidence"
              value={val}
              checked={confidence === val}
              onChange={() => onDraft({ ...draft, confidence: val as Confidence })}
            />
            {label} <kbd>{key}</kbd>
          </label>
        ))}
      </fieldset>
    </section>
  )
}
