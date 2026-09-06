import type { WritingDoc } from '../types'

/** Read the pending writing session document (assignment or graded outcome); null when none is pending. */
export async function fetchWritingSession(): Promise<WritingDoc | null> {
  const response = await fetch('/api/writing')
  if (!response.ok) return null
  const data = await response.json() as { doc?: WritingDoc | null }
  return data.doc ?? null
}

/** Report the graded outcome; the server writes the progress record and retires the session. */
export async function submitWritingResult(score: number): Promise<void> {
  const response = await fetch('/api/writing/result', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ score }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => undefined) as { error?: string } | undefined
    const reason = data?.error ?? `HTTP ${String(response.status)}`
    throw new Error(reason)
  }
}
