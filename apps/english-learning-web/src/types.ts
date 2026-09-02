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
