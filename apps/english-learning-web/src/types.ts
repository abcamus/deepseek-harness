export interface Skill {
  id: string
  title: string
  icon: string
  score: number
  color: string
  colorLight: string
  level: string
  tasks: string[]
  done: boolean[]
}

export interface Material {
  id: string
  name: string
  icon: string
  iconBg: string
  type: string
  meta: string
  badge: 'ready' | 'new'
}

/** One learning material registered on the DSH server. */
export interface MaterialEntry {
  id: string
  name: string
  path: string
  bytes: number
  updatedAt: number
}

export type AbilityId = 'listening' | 'speaking' | 'reading' | 'writing'

/** Real activity counts for one ability dimension. */
export interface SkillActivity {
  exercises: number
  digests: number
  vocabulary: number
  activities: number
  /** Graded answer totals across graded exercise rounds; accuracy = correct/answered. */
  correct: number
  answered: number
}

/** One agent-written learning record, as surfaced in the dashboard. */
export interface ProgressRecordView {
  time: number
  kind: 'digest' | 'exercise'
  skill: string
  material?: string
  level?: string
}

/** Aggregated learning progress served by GET /api/progress. */
export interface ProgressSummary {
  skills: Record<AbilityId, SkillActivity>
  totals: { digests: number; exercises: number; vocabulary: number }
  xp: number
  streakDays: number
  recent: ProgressRecordView[]
}

/** One vocabulary bank group: the words extracted from one material. */
export interface VocabularyGroup {
  time: number
  material?: string
  level?: string
  words: Array<{ word: string; definition: string; example?: string }>
}

export interface Mission {
  id: string
  name: string
  desc: string
  icon: string
  iconBg: string
  xp: number
  done: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  streaming?: boolean
}

export type SSEStatus = 'connecting' | 'connected' | 'disconnected'

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

/** Learner placement record served by GET /api/profile; null means not assessed yet. */
export interface LearnerProfile {
  time: number
  kind: 'placement'
  source: 'placement' | 'manual'
  currentLevel: CEFRLevel
  skills?: Partial<Record<AbilityId, CEFRLevel>>
  weakSkills?: AbilityId[]
  summary?: string
}

export interface Settings {
  name: string
  currentLevel: CEFRLevel
  targetLevel: CEFRLevel
  dailyGoal: number
  responseLanguage: 'zh' | 'en' | 'mixed'
  responseStyle: 'concise' | 'detailed' | 'tutor'
  uiLanguage: 'zh' | 'en'
  theme: 'light' | 'dark' | 'system'
  provider: string
  model: string
}

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  currentLevel: 'B1',
  targetLevel: 'C1',
  dailyGoal: 30,
  responseLanguage: 'mixed',
  responseStyle: 'tutor',
  uiLanguage: 'zh',
  theme: 'light',
  provider: '',
  model: '',
}

export interface DiscoveredModel {
  id: string
  name?: string
  description?: string
  contextWindow?: number
  maxTokens?: number
}

export interface DiscoveredProvider {
  provider: string
  displayName: string
  models: DiscoveredModel[]
}

export interface AddedModel {
  provider: string
  model: string
  name: string
  description?: string | undefined
}

export interface ConfigurableProvider {
  provider: string
  displayName: string
  settingsNs?: string
}
