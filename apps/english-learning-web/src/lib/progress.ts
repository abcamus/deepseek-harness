/**
 * HTTP client for the english-learning progress API (`/api/progress`).
 */

import type { ProgressSummary } from '../types'

export async function fetchProgress(): Promise<ProgressSummary> {
  const response = await fetch('/api/progress')
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  return await JSON.parse(await response.text()) as ProgressSummary
}
