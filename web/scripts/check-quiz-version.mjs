#!/usr/bin/env node
/** Fail the build when quiz.json.model_version ≠ model_manifest.json.model_version. */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const quizPath = join(root, 'src/data/quiz.json')
const manifestPath = join(root, 'public/models/model_manifest.json')

if (!existsSync(quizPath)) {
  console.error('check-quiz-version: missing src/data/quiz.json')
  process.exit(1)
}
if (!existsSync(manifestPath)) {
  console.error('check-quiz-version: missing public/models/model_manifest.json')
  process.exit(1)
}

const quiz = JSON.parse(readFileSync(quizPath, 'utf8'))
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

if (quiz.model_version !== manifest.model_version) {
  console.error(
    `check-quiz-version: mismatch quiz=${quiz.model_version} manifest=${manifest.model_version}`,
  )
  process.exit(1)
}

console.log(`check-quiz-version: ok (${quiz.model_version}, pool=${quiz.pool?.length ?? 0})`)
