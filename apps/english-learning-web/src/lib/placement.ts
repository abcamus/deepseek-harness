import type { PlacementProgress } from '../types'

/** Milliseconds after which an unrestored progress document counts as an abandoned assessment. */
const PROGRESS_STALE_MS = 15 * 60_000

/** Read the in-flight assessment stage from the server; null when none is running or it is stale. */
export async function fetchPlacementProgress(): Promise<PlacementProgress | null> {
  const response = await fetch('/api/placement')
  if (!response.ok) return null
  const data = await response.json() as { progress?: PlacementProgress | null }
  const progress = data.progress ?? null
  if (progress === null || isProgressStale(progress)) return null
  return progress
}

/** Whether the progress document is old enough that its assessment was likely abandoned. */
export function isProgressStale(progress: PlacementProgress): boolean {
  return Date.now() - progress.time > PROGRESS_STALE_MS
}
