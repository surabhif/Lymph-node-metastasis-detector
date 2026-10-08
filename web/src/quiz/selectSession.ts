import { mulberry32, shuffleInPlace } from '../lib/prng'
import type { QuizItem } from './types'

const PER_CLASS = 5
const WANT: Array<{ stratum: QuizItem['stratum']; n: number }> = [
  { stratum: 'confident_correct', n: 3 },
  { stratum: 'uncertain', n: 1 },
  { stratum: 'model_error', n: 1 },
]

function take(
  pool: QuizItem[],
  label: 'tumor' | 'normal',
  stratum: QuizItem['stratum'],
  n: number,
  rand: () => number,
  used: Set<string>,
): QuizItem[] {
  const candidates = shuffleInPlace(
    pool.filter((p) => p.label === label && p.stratum === stratum && !used.has(p.id)),
    rand,
  )
  const picked = candidates.slice(0, n)
  for (const p of picked) used.add(p.id)
  return picked
}

function fill(
  pool: QuizItem[],
  label: 'tumor' | 'normal',
  need: number,
  rand: () => number,
  used: Set<string>,
): QuizItem[] {
  if (need <= 0) return []
  const candidates = shuffleInPlace(
    pool.filter((p) => p.label === label && !used.has(p.id)),
    rand,
  )
  const picked = candidates.slice(0, need)
  for (const p of picked) used.add(p.id)
  return picked
}

/**
 * Build a 10-patch session: 5 tumor + 5 normal.
 * Preferred mix per class: 3 confident-correct, 1 uncertain, 1 model error.
 * Missing strata are back-filled from the remaining class pool so smaller
 * fallback pools (no full PCam export yet) still produce a playable set.
 */
export function selectSession(pool: QuizItem[], seed: number, size = 10): QuizItem[] {
  const rand = mulberry32(seed)
  const used = new Set<string>()
  const out: QuizItem[] = []

  for (const label of ['tumor', 'normal'] as const) {
    let got = 0
    for (const want of WANT) {
      const picked = take(pool, label, want.stratum, want.n, rand, used)
      out.push(...picked)
      got += picked.length
    }
    if (got < PER_CLASS) {
      out.push(...fill(pool, label, PER_CLASS - got, rand, used))
    }
  }

  // If the pool is still short (tiny fallback), fill from anything left.
  if (out.length < size) {
    const rest = shuffleInPlace(
      pool.filter((p) => !used.has(p.id)),
      rand,
    )
    for (const p of rest) {
      if (out.length >= size) break
      out.push(p)
      used.add(p.id)
    }
  }

  return shuffleInPlace(out.slice(0, size), rand)
}
