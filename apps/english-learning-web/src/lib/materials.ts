/**
 * HTTP client for the english-learning materials API (`/api/materials`).
 */

import type { MaterialEntry } from '../types'

async function parseError(response: Response): Promise<never> {
  let reason = `HTTP ${String(response.status)}`
  try {
    const body = JSON.parse(await response.text()) as { error?: string }
    if (typeof body.error === 'string') reason = body.error
  } catch {
    // Non-JSON error body; keep the HTTP status reason.
  }
  throw new Error(reason)
}

export async function listMaterials(): Promise<MaterialEntry[]> {
  const response = await fetch('/api/materials')
  if (!response.ok) return await parseError(response)
  const body = JSON.parse(await response.text()) as { materials?: MaterialEntry[] }
  return body.materials ?? []
}

export async function addMaterial(name: string, content: string): Promise<MaterialEntry> {
  const response = await fetch('/api/materials', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, content }),
  })
  if (!response.ok) return await parseError(response)
  const body = JSON.parse(await response.text()) as { material: MaterialEntry }
  return body.material
}

export async function deleteMaterial(id: string): Promise<void> {
  const response = await fetch('/api/materials', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!response.ok) return await parseError(response)
}
