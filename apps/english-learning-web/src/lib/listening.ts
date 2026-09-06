import type { ListeningExercise } from '../types'

/** Read the pending listening exercise from the server; null when none is pending. */
export async function fetchListeningSession(): Promise<ListeningExercise | null> {
  const response = await fetch('/api/listening')
  if (!response.ok) return null
  const data = await response.json() as { exercise?: ListeningExercise | null }
  return data.exercise ?? null
}

/** Report the graded round outcome; the server writes the progress record and retires the session. */
export async function submitListeningResult(count: number, correct: number): Promise<void> {
  const response = await fetch('/api/listening/result', {
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
