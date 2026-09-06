import type { ReadingExercise } from '../types'

/** Read the pending reading exercise from the server; null when none is pending. */
export async function fetchReadingSession(): Promise<ReadingExercise | null> {
  const response = await fetch('/api/reading')
  if (!response.ok) return null
  const data = await response.json() as { exercise?: ReadingExercise | null }
  return data.exercise ?? null
}

/** Report the graded round outcome; the server writes the progress record and retires the session. */
export async function submitReadingResult(count: number, correct: number): Promise<void> {
  const response = await fetch('/api/reading/result', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ count, correct }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => undefined) as { error?: string } | undefined
    const reason = data?.error ?? `HTTP ${String(response.status)}`
    throw new Error(reason)
  }
}
