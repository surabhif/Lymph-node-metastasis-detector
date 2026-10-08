import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import quizData from '../data/quiz.json'
import { parseSeed } from '../lib/prng'
import QuizQuestion from '../quiz/QuizQuestion'
import QuizReveal from '../quiz/QuizReveal'
import QuizSummary from '../quiz/QuizSummary'
import { selectSession } from '../quiz/selectSession'
import type { QuizManifest, UserAnswer } from '../quiz/types'

type Phase = 'intro' | 'question' | 'reveal' | 'summary' | 'review'

const quiz = quizData as QuizManifest
const BASE = import.meta.env.BASE_URL

export default function QuizPage() {
  const [params, setParams] = useSearchParams()
  const seed = useMemo(
    () => parseSeed(params.get('seed'), quiz.seed_default),
    [params],
  )
  const session = useMemo(
    () => selectSession(quiz.pool as QuizManifest['pool'], seed, quiz.session_size),
    [seed],
  )

  const [phase, setPhase] = useState<Phase>('intro')
  const [index, setIndex] = useState(0)
  const [draft, setDraft] = useState<Partial<UserAnswer>>({ confidence: 'fairly' })
  const [answers, setAnswers] = useState<UserAnswer[]>([])
  const [persistBest, setPersistBest] = useState(false)

  const item = session[index]

  useEffect(() => {
    // Focus question/reveal headings when they appear.
    const id =
      phase === 'question'
        ? 'quiz-q-heading'
        : phase === 'reveal' || phase === 'review'
          ? 'quiz-reveal-heading'
          : phase === 'summary'
            ? 'quiz-summary-heading'
            : 'quiz-intro-heading'
    const el = document.getElementById(id)
    el?.focus({ preventScroll: true })
  }, [phase, index])

  const submitDraft = useCallback(() => {
    if (!draft.choice) return
    const next: UserAnswer = {
      choice: draft.choice,
      confidence: draft.confidence ?? 'fairly',
    }
    setAnswers((prev) => {
      const copy = prev.slice()
      copy[index] = next
      return copy
    })
    setPhase('reveal')
  }, [draft, index])

  const goNext = useCallback(() => {
    if (index + 1 >= session.length) {
      if (persistBest) {
        try {
          const finalYou = session.reduce((n, it, i) => {
            const a = answers[i]
            return n + (a && a.choice === it.label ? 1 : 0)
          }, 0)
          const prev = Number(localStorage.getItem('quiz-best') || '0')
          if (finalYou > prev) localStorage.setItem('quiz-best', String(finalYou))
        } catch {
          /* private mode */
        }
      }
      setPhase('summary')
      return
    }
    setIndex((i) => i + 1)
    setDraft({ confidence: 'fairly' })
    setPhase('question')
  }, [index, session, answers, persistBest])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (phase === 'intro' && e.key === 'Enter') {
        setPhase('question')
        return
      }
      if (phase === 'question') {
        if (e.key === 't' || e.key === 'T') {
          setDraft((d) => ({ ...d, choice: 'tumor', confidence: d.confidence ?? 'fairly' }))
        } else if (e.key === 'n' || e.key === 'N') {
          setDraft((d) => ({ ...d, choice: 'normal', confidence: d.confidence ?? 'fairly' }))
        } else if (e.key === '1') {
          setDraft((d) => ({ ...d, confidence: 'guess' }))
        } else if (e.key === '2') {
          setDraft((d) => ({ ...d, confidence: 'fairly' }))
        } else if (e.key === '3') {
          setDraft((d) => ({ ...d, confidence: 'very' }))
        } else if (e.key === 'Enter') {
          submitDraft()
        }
      } else if ((phase === 'reveal' || phase === 'review') && e.key === 'Enter') {
        if (phase === 'review') setPhase('summary')
        else goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, submitDraft, goNext])

  function restart() {
    const nextSeed = (seed + 1) >>> 0
    setParams({ seed: String(nextSeed) })
    setIndex(0)
    setAnswers([])
    setDraft({ confidence: 'fairly' })
    setPhase('intro')
  }

  return (
    <div className="fade-in quiz-page">
      <header className="page-intro">
        <h1 tabIndex={-1}>You vs. the model</h1>
        <p>
          Label 10 real PCam patches. Then see how the model answered, with a CAM heatmap. Answers
          stay on this device — nothing is uploaded.
        </p>
      </header>

      {phase === 'intro' && (
        <section className="panel quiz-intro" aria-labelledby="quiz-intro-heading">
          <h2 id="quiz-intro-heading" tabIndex={-1}>
            Before you start
          </h2>
          <ul>
            <li>
              Each patch is 96×96 pixels. The official label is about the <strong>centre 32×32</strong>{' '}
              region (shown as a dashed square).
            </li>
            <li>
              Keyboard: <kbd>T</kbd> tumor · <kbd>N</kbd> normal · <kbd>1</kbd>–<kbd>3</kbd>{' '}
              confidence · <kbd>Enter</kbd> confirm.
            </li>
            <li>
              This set includes patches the model gets wrong on purpose. It is not a test of medical
              skill.
            </li>
          </ul>
          <p className="muted tiny">
            Pool source: {quiz.source} · model {quiz.model_version} · seed {seed}
          </p>
          <label className="quiz-persist">
            <input
              type="checkbox"
              checked={persistBest}
              onChange={(e) => setPersistBest(e.target.checked)}
            />
            Remember my best score in this browser (off by default; clearable; nothing leaves the
            device)
          </label>
          <p>
            <button type="button" className="btn" onClick={() => setPhase('question')}>
              Start <kbd>Enter</kbd>
            </button>
          </p>
        </section>
      )}

      {phase === 'question' && item && (
        <>
          <QuizQuestion
            item={item}
            index={index}
            total={session.length}
            draft={draft}
            onDraft={setDraft}
            baseUrl={BASE}
          />
          <p>
            <button
              type="button"
              className="btn"
              disabled={!draft.choice}
              onClick={submitDraft}
            >
              Check answer <kbd>Enter</kbd>
            </button>
          </p>
        </>
      )}

      {(phase === 'reveal' || phase === 'review') && item && answers[index] && (
        <QuizReveal
          item={item}
          answer={answers[index]!}
          baseUrl={BASE}
          isLast={index + 1 >= session.length}
          onNext={() => {
            if (phase === 'review') setPhase('summary')
            else goNext()
          }}
        />
      )}

      {phase === 'summary' && (
        <QuizSummary
          items={session}
          answers={answers}
          seed={seed}
          disclaimer={quiz.disclaimer}
          baseUrl={BASE}
          onRestart={restart}
          onReview={(i) => {
            setIndex(i)
            setPhase('review')
          }}
        />
      )}

      <p className="muted tiny" style={{ marginTop: '1.5rem' }}>
        Want to re-run a patch live?{' '}
        <Link to="/demo">Open the detector</Link> (loads the ONNX model). The quiz itself never
        requests the model file.
      </p>
    </div>
  )
}
