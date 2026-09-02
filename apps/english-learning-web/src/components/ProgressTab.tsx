import type { Skill } from '../types'

interface ProgressTabProps {
  skills: Skill[]
}

export function ProgressTab({ skills }: ProgressTabProps) {
  return (
    <>
      {skills.map(s => (
        <div key={s.id} className="progress-stat">
          <div className="progress-icon" style={{ background: s.colorLight }}>{s.icon}</div>
          <div className="progress-info">
            <div className="progress-label">{s.title.replace(/^.\s*/, '')}</div>
            <div className="progress-val" style={{ color: s.color }}>{s.score}</div>
          </div>
          <div className="progress-change progress-up">↑ {Math.floor(Math.random() * 10) + 1}</div>
        </div>
      ))}
      <div className="progress-stat">
        <div className="progress-icon" style={{ background: '#FEF3C7' }}>🔥</div>
        <div className="progress-info">
          <div className="progress-label">连续学习</div>
          <div className="progress-val" style={{ color: '#D97706' }}>7 天</div>
        </div>
        <div className="progress-change progress-streak">保持!</div>
      </div>
    </>
  )
}
