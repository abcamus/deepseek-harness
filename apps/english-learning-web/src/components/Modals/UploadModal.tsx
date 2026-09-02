interface UploadModalProps {
  onClose: () => void
}

export function UploadModal({ onClose }: UploadModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => { e.stopPropagation() }}>
        <div className="modal-header">
          <div className="modal-title">📁 上传学习资料</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="upload-zone">
            <div className="upload-zone-icon">📁</div>
            <div className="upload-zone-text">点击或拖拽文件</div>
            <div className="upload-zone-sub">支持 MP3, MP4, PDF, TXT</div>
            <div className="upload-formats">
              <span className="upload-format">MP3</span>
              <span className="upload-format">MP4</span>
              <span className="upload-format">PDF</span>
              <span className="upload-format">TXT</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">学习目标</label>
            <select className="form-input">
              <option>全面提升</option>
              <option>听力训练</option>
              <option>口语练习</option>
              <option>阅读理解</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="modal-btn" onClick={onClose}>取消</button>
          <button className="modal-btn pr" onClick={onClose}>开始分析</button>
        </div>
      </div>
    </div>
  )
}
