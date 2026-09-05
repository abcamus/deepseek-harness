/**
 * HTTP client for the english-learning profile API (`/api/profile`).
 */

import type { CEFRLevel, LearnerProfile } from '../types'

/** Read the learner placement record; null means not assessed yet. */
export async function fetchProfile(): Promise<LearnerProfile | null> {
  const response = await fetch('/api/profile')
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  const data = await JSON.parse(await response.text()) as { profile: LearnerProfile | null }
  return data.profile
}

/** Persist a manually picked level as the learner placement record. */
export async function saveManualProfile(currentLevel: CEFRLevel): Promise<LearnerProfile> {
  const response = await fetch('/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ currentLevel }),
  })
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  const data = await JSON.parse(await response.text()) as { profile: LearnerProfile }
  return data.profile
}
