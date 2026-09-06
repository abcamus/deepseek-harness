import type { SpeakingExercise } from '../types'

/** Read the pending speaking exercise from the server; null when none is pending. */
export async function fetchSpeakingSession(): Promise<SpeakingExercise | null> {
  const response = await fetch('/api/speaking')
  if (!response.ok) return null
  const data = await response.json() as { exercise?: SpeakingExercise | null }
  return data.exercise ?? null
}

/** Report the scored round outcome; the server writes the progress record and retires the session. */
export async function submitSpeakingResult(count: number, correct: number): Promise<void> {
  const response = await fetch('/api/speaking/result', {
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
