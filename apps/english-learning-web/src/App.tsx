import { useCallback, useEffect, useState } from 'react'
import { Routes, Route, useLocation, useNavigate } from 'react-router'
import type { Skill, Material, Mission, Settings, MaterialEntry, ProgressSummary, AbilityId, VocabularyGroup, LearnerProfile } from './types'
import { DEFAULT_SETTINGS } from './types'
import { useSSE } from './hooks/useSSE'
import { addMaterial, deleteMaterial, listMaterials } from './lib/materials'
import { fetchProgress } from './lib/progress'
import { fetchProfile } from './lib/profile'
import { fetchVocabulary } from './lib/vocabulary'
import { TopBar } from './components/TopBar'
import { LevelPath } from './components/LevelPath'
import { SkillCard } from './components/SkillCard'
import { RightPanel } from './components/RightPanel'
import { AIChat } from './components/AIChat'
import { SettingsPage } from './components/SettingsPage'
import { SkillDetailModal } from './components/Modals/SkillDetailModal'
import { UploadModal } from './components/Modals/UploadModal'
import { AIFindModal } from './components/Modals/AIFindModal'
import { PlacementModal } from './components/Modals/PlacementModal'

/** Fixed presentation for the four ability dimensions; activity numbers come from /api/progress. */
const ABILITY_DEFS: Array<{ id: AbilityId; title: string; icon: string; color: string; colorLight: string }> = [
  { id: 'listening', title: '🎧 听力理解', icon: '🎧', color: 'var(--tl)', colorLight: 'var(--tl-l)' },
  { id: 'speaking', title: '🗣️ 口语表达', icon: '🗣️', color: 'var(--accent)', colorLight: 'var(--accent-l)' },
  { id: 'reading', title: '📖 阅读理解', icon: '📖', color: 'var(--secondary)', colorLight: 'var(--pu-l)' },
  { id: 'writing', title: '✍️ 写作练习', icon: '✍️', color: 'var(--primary)', colorLight: 'var(--primary-l)' },
]

/** XP needed for one learner level; a level is five stages. */
const XP_PER_LEVEL = 200

const MATERIALS_ICON = { icon: '📄', iconBg: 'var(--pu-l)' }

const MISSIONS: Mission[] = [
  { id: 'ms1', name: '学习 5 个新单词', desc: '词汇 · 3/5 完成', icon: '📚', iconBg: 'var(--accent-l)', xp: 20, done: false },
  { id: 'ms2', name: '完成听力练习', desc: '听力 · 0/1 完成', icon: '🎧', iconBg: 'var(--tl-l)', xp: 25, done: false },
  { id: 'ms3', name: '跟读一段材料', desc: '口语 · 0/1 完成', icon: '🗣️', iconBg: 'var(--secondary-l)', xp: 30, done: false },
  { id: 'ms4', name: '今日登录', desc: '每日 · 已完成', icon: '✅', iconBg: 'var(--primary-l)', xp: 10, done: true },
]

/** localStorage key marking that the user dismissed the placement onboarding modal. */
const PLACEMENT_DISMISSED_KEY = 'placement-modal-dismissed'

export function App() {
  const { messages, status, sendMessage } = useSSE()
  const location = useLocation()
  const navigate = useNavigate()
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showAiFind, setShowAiFind] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [materials, setMaterials] = useState<MaterialEntry[]>([])
  const [analyzedIds, setAnalyzedIds] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<ProgressSummary | null>(null)
  const [vocabulary, setVocabulary] = useState<VocabularyGroup[]>([])
  const [profile, setProfile] = useState<LearnerProfile | null | undefined>(undefined)
  const [showPlacement, setShowPlacement] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = () => {
      listMaterials().then(
        (entries) => { if (mounted) setMaterials(entries) },
        (err: unknown) => { console.error('failed to load materials:', err) },
      )
      fetchProgress().then(
        (summary) => { if (mounted) setProgress(summary) },
        (err: unknown) => { console.error('failed to load progress:', err) },
      )
      fetchVocabulary().then(
        (entries) => { if (mounted) setVocabulary(entries) },
        (err: unknown) => { console.error('failed to load vocabulary:', err) },
      )
      fetchProfile().then(
        (p) => { if (mounted) setProfile(p) },
        (err: unknown) => { console.error('failed to load profile:', err) },
      )
    }
    load()
    const timer = setInterval(load, 30_000)
    return () => { mounted = false; clearInterval(timer) }
  }, [])

  // Onboarding: offer the placement assessment once, until it is done or dismissed.
  useEffect(() => {
    if (profile === null && localStorage.getItem(PLACEMENT_DISMISSED_KEY) === null) {
      setShowPlacement(true)
    }
  }, [profile])

  const handleAddMaterial = useCallback(async (name: string, content: string) => {
    const entry = await addMaterial(name, content)
    setMaterials(prev => [entry, ...prev.filter(m => m.id !== entry.id)])
  }, [])

  const handleDeleteMaterial = useCallback(async (id: string) => {
    await deleteMaterial(id)
    setMaterials(prev => prev.filter(m => m.id !== id))
  }, [])

  const handleAnalyzeMaterial = useCallback((entry: MaterialEntry) => {
    setAnalyzedIds(prev => new Set(prev).add(entry.id))
    void sendMessage(`请使用 material-digest 技能分析学习资料「${entry.name}」，用 read 工具读取文件：${entry.path}`)
    void navigate('/')
  }, [sendMessage, navigate])

  const handlePracticeMaterial = useCallback((entry: MaterialEntry) => {
    void sendMessage(`请使用 exercise-generator 技能，基于学习资料「${entry.name}」对我进行交互式训练（用 read 工具读取文件：${entry.path}）。先读取 .english-learning/profile.json 里的定级结果判断我的水平和薄弱维度（没有档案再读 .english-learning/progress/ 下的记录），从薄弱维度开始出题。`)
    void navigate('/')
  }, [sendMessage, navigate])

  const handleReviewVocabulary = useCallback(() => {
    void sendMessage('请使用 exercise-generator 技能对我进行词汇复习训练：读取 .english-learning/vocabulary/ 词汇本，从中挑 5 个词出题（选择或填空），等我作答后批改并记录成绩。')
    void navigate('/')
  }, [sendMessage, navigate])

  const handleAiFind = useCallback((topic: string) => {
    const preference = topic.trim() === '' ? '主题由你根据我的薄弱维度决定' : `主题偏好：「${topic.trim()}」`
    void sendMessage(`请使用 material-search 技能，先读取 .english-learning/profile.json 里的定级结果评估我的能力情况（当前水平和薄弱维度；没有档案再读 .english-learning/progress/ 下的学习记录），然后自动搜索并抓取一份合适的英语学习资料，保存到 .english-learning/materials/ 目录。${preference}。`)
    void navigate('/')
  }, [sendMessage, navigate])

  /** Send the placement assessment request through the chat and surface the chat panel. */
  const startPlacement = useCallback(() => {
    setShowPlacement(false)
    void sendMessage('请使用 placement-assessment 技能对我进行初始定级测评，完成后把结果写入 .english-learning/profile.json')
    void navigate('/')
  }, [sendMessage, navigate])

  const dismissPlacement = useCallback(() => {
    localStorage.setItem(PLACEMENT_DISMISSED_KEY, '1')
    setShowPlacement(false)
  }, [])

  const displayMaterials: Material[] = materials.map(m => ({
    id: m.id,
    name: m.name,
    ...MATERIALS_ICON,
    type: `文本 · ${Math.max(1, Math.round(m.bytes / 1024))} KB`,
    meta: m.path,
    badge: analyzedIds.has(m.id) ? 'ready' : 'new',
  }))

  // The assessed placement is the authoritative current level; the settings pick only covers
  // the period before the first assessment.
  const effectiveLevel = profile?.currentLevel ?? settings.currentLevel

  // Ability dimensions derive from the agent's real learning records: score is activity
  // volume (each record is worth 20 points, capped at 100); graded rounds add an accuracy
  // read-out to the exercise task.
  const buildSkills = (): Skill[] => ABILITY_DEFS.map((def) => {
    const activity = progress?.skills[def.id] ?? {
      exercises: 0, digests: 0, vocabulary: 0, activities: 0, correct: 0, answered: 0,
    }
    const accuracy = activity.answered > 0
      ? ` · 正确${String(Math.round((activity.correct / activity.answered) * 100))}%`
      : ''
    const tasks = [
      { label: `完成练习 ×${activity.exercises}${accuracy}`, done: activity.exercises > 0 },
      { label: `积累词汇 ×${activity.vocabulary}`, done: activity.vocabulary > 0 },
      { label: `分析材料 ×${activity.digests}`, done: activity.digests > 0 },
    ]
    return {
      id: def.id,
      title: def.title,
      icon: def.icon,
      score: Math.min(100, activity.activities * 20),
      color: def.color,
      colorLight: def.colorLight,
      level: `${effectiveLevel} → ${settings.targetLevel}`,
      tasks: tasks.map(t => t.label),
      done: tasks.map(t => t.done),
    }
  })

  const xp = progress?.xp ?? 0
  const levelNumber = 1 + Math.floor(xp / XP_PER_LEVEL)
  const xpIntoLevel = xp % XP_PER_LEVEL
  const stage = Math.min(5, Math.floor(xpIntoLevel / (XP_PER_LEVEL / 5)) + 1)

  const handleSkillClick = (id: string) => {
    setSelectedSkill(buildSkills().find(s => s.id === id) ?? null)
  }

  return (
    <div className="app">
      <TopBar xp={xp} xpIntoLevel={xpIntoLevel} xpPerLevel={XP_PER_LEVEL} cefr={effectiveLevel} streakDays={progress?.streakDays ?? 0} />

      <Routes>
        <Route
          path="/"
          element={
            <div className="main">
              <div className="left">
                <LevelPath level={levelNumber} currentStage={stage} totalStages={5} />
                <div className="skill-grid">
                  {buildSkills().map(s => (
                    <SkillCard key={s.id} skill={s} onClick={handleSkillClick} />
                  ))}
                </div>
              </div>
              <RightPanel
                materials={displayMaterials}
                missions={MISSIONS}
                skills={buildSkills()}
                streakDays={progress?.streakDays ?? 0}
                vocabulary={vocabulary}
                onUpload={() => { setShowUpload(true) }}
                onAiFind={() => { setShowAiFind(true) }}
                onDeleteMaterial={(id) => { void handleDeleteMaterial(id) }}
                onAnalyzeMaterial={(id) => {
                  const entry = materials.find(m => m.id === id)
                  if (entry !== undefined) handleAnalyzeMaterial(entry)
                }}
                onPracticeMaterial={(id) => {
                  const entry = materials.find(m => m.id === id)
                  if (entry !== undefined) handlePracticeMaterial(entry)
                }}
                onReviewVocabulary={handleReviewVocabulary}
              />
            </div>
          }
        />
        <Route
          path="/settings"
          element={
            <SettingsPage
              settings={{ ...settings, currentLevel: effectiveLevel }}
              profile={profile ?? null}
              onSave={setSettings}
              onProfileSaved={setProfile}
              onRetakeAssessment={startPlacement}
            />
          }
        />
      </Routes>

      {location.pathname !== '/settings' && (
        <AIChat messages={messages} status={status} onSend={(text) => { void sendMessage(text) }} />
      )}

      <SkillDetailModal skill={selectedSkill} onClose={() => { setSelectedSkill(null) }} />
      {showUpload && (
        <UploadModal
          onClose={() => { setShowUpload(false) }}
          onAdd={(name, content) => { void handleAddMaterial(name, content) }}
        />
      )}
      {showAiFind && (
        <AIFindModal
          currentLevel={effectiveLevel}
          onClose={() => { setShowAiFind(false) }}
          onFind={handleAiFind}
        />
      )}
      {showPlacement && (
        <PlacementModal
          onStart={startPlacement}
          onSkip={dismissPlacement}
        />
      )}
    </div>
  )
}
