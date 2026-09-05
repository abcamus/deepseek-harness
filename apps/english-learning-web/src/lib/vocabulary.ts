/**
 * HTTP client for the english-learning vocabulary API (`/api/vocabulary`).
 */

import type { VocabularyGroup } from '../types'

export async function fetchVocabulary(): Promise<VocabularyGroup[]> {
  const response = await fetch('/api/vocabulary')
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  const body = JSON.parse(await response.text()) as { entries?: VocabularyGroup[] }
  return body.entries ?? []
}
