import { useState } from 'react'
import { Routes, Route, useLocation } from 'react-router'
import type { Skill, Material, Mission, Settings } from './types'
import { DEFAULT_SETTINGS } from './types'
import { useSSE } from './hooks/useSSE'
import { TopBar } from './components/TopBar'
import { LevelPath } from './components/LevelPath'
import { SkillCard } from './components/SkillCard'
import { RightPanel } from './components/RightPanel'
import { AIChat } from './components/AIChat'
import { SettingsPage } from './components/SettingsPage'
import { SkillDetailModal } from './components/Modals/SkillDetailModal'
import { UploadModal } from './components/Modals/UploadModal'
import { AIFindModal } from './components/Modals/AIFindModal'

const SKILLS: Skill[] = [
  { id: 'listening', title: '🎧 听力理解', icon: '🎧', score: 62, color: 'var(--tl)', colorLight: 'var(--tl-l)', level: 'B1 → B2', tasks: ['主旨理解', '细节捕捉', '连读识别'], done: [true, false, false] },
  { id: 'speaking', title: '🗣️ 口语表达', icon: '🗣️', score: 45, color: 'var(--accent)', colorLight: 'var(--accent-l)', level: 'A2 → B1', tasks: ['发音准确', '语调自然', '流利度'], done: [true, true, false] },
  { id: 'reading', title: '📖 阅读理解', icon: '📖', score: 70, color: 'var(--secondary)', colorLight: 'var(--pu-l)', level: 'B1 → B2', tasks: ['词汇猜测', '段落大意', '推理判断'], done: [true, true, true] },
  { id: 'writing', title: '✍️ 写作练习', icon: '✍️', score: 38, color: 'var(--primary)', colorLight: 'var(--primary-l)', level: 'A2 → B1', tasks: ['语法正确', '词汇丰富', '逻辑连贯'], done: [true, false, false] },
]

const MATERIALS: Material[] = [
  { id: 'm1', name: 'TED: Power of Vulnerability', icon: '🎬', iconBg: 'var(--tl-l)', type: '视频 · 20:19', meta: '', badge: 'ready' },
  { id: 'm2', name: 'BBC 6min English', icon: '🎧', iconBg: 'var(--accent-l)', type: '音频 · 6:45', meta: '', badge: 'ready' },
  { id: 'm3', name: 'The Great Gatsby Ch.1', icon: '📄', iconBg: 'var(--pu-l)', type: 'PDF · 15页', meta: '', badge: 'new' },
]

const MISSIONS: Mission[] = [
  { id: 'ms1', name: '学习 5 个新单词', desc: '词汇 · 3/5 完成', icon: '📚', iconBg: 'var(--accent-l)', xp: 20, done: false },
  { id: 'ms2', name: '完成听力练习', desc: '听力 · 0/1 完成', icon: '🎧', iconBg: 'var(--tl-l)', xp: 25, done: false },
  { id: 'ms3', name: '跟读一段材料', desc: '口语 · 0/1 完成', icon: '🗣️', iconBg: 'var(--secondary-l)', xp: 30, done: false },
  { id: 'ms4', name: '今日登录', desc: '每日 · 已完成', icon: '✅', iconBg: 'var(--primary-l)', xp: 10, done: true },
]

export function App() {
  const { messages, status, sendMessage } = useSSE()
  const location = useLocation()
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showAiFind, setShowAiFind] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const handleSkillClick = (id: string) => {
    const skill = SKILLS.find(s => s.id === id)
    if (skill !== undefined) setSelectedSkill(skill)
  }

  return (
    <div className="app">
      <TopBar />

      <Routes>
        <Route
          path="/"
          element={
            <div className="main">
              <div className="left">
                <LevelPath level={12} currentStage={3} totalStages={5} />
                <div className="skill-grid">
                  {SKILLS.map(s => (
                    <SkillCard key={s.id} skill={s} onClick={handleSkillClick} />
                  ))}
                </div>
              </div>
              <RightPanel
                materials={MATERIALS}
                missions={MISSIONS}
                skills={SKILLS}
                onUpload={() => { setShowUpload(true) }}
              />
            </div>
          }
        />
        <Route
          path="/settings"
          element={
            <SettingsPage
              settings={settings}
              onSave={setSettings}
            />
          }
        />
      </Routes>

      {location.pathname !== '/settings' && (
        <AIChat messages={messages} status={status} onSend={(text) => { void sendMessage(text) }} />
      )}

      <SkillDetailModal skill={selectedSkill} onClose={() => { setSelectedSkill(null) }} />
      {showUpload && <UploadModal onClose={() => { setShowUpload(false) }} />}
      {showAiFind && <AIFindModal onClose={() => { setShowAiFind(false) }} />}
    </div>
  )
}
