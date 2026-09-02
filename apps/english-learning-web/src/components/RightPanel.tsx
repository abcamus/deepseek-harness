import { useState } from 'react'
import type { Material, Mission, Skill } from '../types'
import { MaterialsTab } from './MaterialsTab'
import { MissionsTab } from './MissionsTab'
import { ProgressTab } from './ProgressTab'

interface RightPanelProps {
  materials: Material[]
  missions: Mission[]
  skills: Skill[]
  onUpload: () => void
}

type TabId = 'materials' | 'missions' | 'progress'

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: 'materials', icon: '📚', label: '资料' },
  { id: 'missions', icon: '🎯', label: '任务' },
  { id: 'progress', icon: '📈', label: '进度' },
]

export function RightPanel({ materials, missions, skills, onUpload }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('materials')

  return (
    <div className="right">
      <div className="tabs">
        {TABS.map(tab => (
          <div
            key={tab.id}
            className={`tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.id) }}
          >
            <span className="tab-ic">{tab.icon}</span>
            {tab.label}
          </div>
        ))}
      </div>

      <div className="right-sc">
        {activeTab === 'materials' && <MaterialsTab materials={materials} onUpload={onUpload} />}
        {activeTab === 'missions' && <MissionsTab missions={missions} />}
        {activeTab === 'progress' && <ProgressTab skills={skills} />}
      </div>
    </div>
  )
}
