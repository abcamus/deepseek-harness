interface AIFindModalProps {
  onClose: () => void
}

export function AIFindModal({ onClose }: AIFindModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => { e.stopPropagation() }}>
        <div className="modal-header">
          <div className="modal-title">🤖 AI 找资料</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">你想学什么？</label>
            <input className="form-input" placeholder="商务英语、日常对话、TED演讲..." />
          </div>
          <div className="form-group">
            <label className="form-label">难度偏好</label>
            <select className="form-input">
              <option>适合我的水平 (B1)</option>
              <option>稍有挑战 (B2)</option>
              <option>简单易懂 (A2)</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn" onClick={onClose}>取消</button>
          <button className="modal-btn pr" onClick={onClose}>获取推荐</button>
        </div>
      </div>
    </div>
  )
}
