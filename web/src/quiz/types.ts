export type QuizItem = {
  id: string
  testIndex: number
  label: 'tumor' | 'normal'
  probability: number
  verdict: 'tumor' | 'normal' | 'uncertain'
  stratum: 'confident_correct' | 'uncertain' | 'model_error'
  src: string
  camSrc: string
}

export type Confidence = 'guess' | 'fairly' | 'very'

export type UserAnswer = {
  choice: 'tumor' | 'normal'
  confidence: Confidence
}

export type QuizManifest = {
  schema_version: number
  model_version: string
  threshold: number
  uncertain_lo: number
  uncertain_hi: number
  seed_default: number
  session_size: number
  source: string
  disclaimer: string
  pool: QuizItem[]
}
