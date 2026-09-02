import type { Material } from '../types'

interface MaterialsTabProps {
  materials: Material[]
  onUpload: () => void
}

export function MaterialsTab({ materials, onUpload }: MaterialsTabProps) {
  return (
    <>
      {materials.map(m => (
        <div key={m.id} className="material-item">
          <div className="material-icon" style={{ background: m.iconBg }}>{m.icon}</div>
          <div className="material-info">
            <div className="material-name">{m.name}</div>
            <div className="material-meta">
              <span>{m.type}</span>
              <span className={`material-badge badge-${m.badge}`}>
                {m.badge === 'ready' ? '已分析' : '新'}
              </span>
            </div>
          </div>
        </div>
      ))}
      <div className="material-item" style={{ borderStyle: 'dashed', justifyContent: 'center' }} onClick={onUpload}>
        <span style={{ fontSize: 24 }}>+</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx3)' }}>添加资料</span>
      </div>
    </>
  )
}
