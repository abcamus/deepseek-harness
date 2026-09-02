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
