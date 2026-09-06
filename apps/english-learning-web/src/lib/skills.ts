import type { SkillInfo } from '../types'

/** List the preset skills with their routing metadata and enabled flags. */
export async function fetchSkills(): Promise<SkillInfo[]> {
  const response = await fetch('/api/skills')
  if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
  const data = await response.json() as { skills?: SkillInfo[] }
  return data.skills ?? []
}

/** Enable or disable one skill; the change persists and applies to the tutor's next turn. */
export async function updateSkillConfig(name: string, enabled: boolean): Promise<void> {
  const response = await fetch('/api/skills', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, enabled }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => undefined) as { error?: string } | undefined
    const reason = data?.error ?? `HTTP ${String(response.status)}`
    throw new Error(reason)
  }
}
