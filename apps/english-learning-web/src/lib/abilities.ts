import type { AbilityId, CEFRLevel } from '../types'

/** Fixed presentation for the four ability dimensions; colors map to the app design tokens. Titles keep the leading icon, matching the skill-card convention. */
export const ABILITY_DEFS: Array<{ id: AbilityId; title: string; icon: string; color: string; colorLight: string }> = [
  { id: 'listening', title: '🎧 听力理解', icon: '🎧', color: 'var(--tl)', colorLight: 'var(--tl-l)' },
  { id: 'speaking', title: '🗣️ 口语表达', icon: '🗣️', color: 'var(--accent)', colorLight: 'var(--accent-l)' },
  { id: 'reading', title: '📖 阅读理解', icon: '📖', color: 'var(--secondary)', colorLight: 'var(--pu-l)' },
  { id: 'writing', title: '✍️ 写作练习', icon: '✍️', color: 'var(--primary)', colorLight: 'var(--primary-l)' },
]

/** Chinese labels for the CEFR levels, keyed by level code. */
export const CEFR_LABELS: Record<CEFRLevel, string> = {
  A1: 'A1 入门',
  A2: 'A2 初级',
  B1: 'B1 中级',
  B2: 'B2 中高级',
  C1: 'C1 高级',
  C2: 'C2 精通',
}
