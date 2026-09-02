export function TopBar() {
  return (
    <div className="topbar">
      <div className="tb-left">
        <div className="tb-logo">
          <div className="tb-logo-ic">ED</div>
          <div className="tb-logo-tx">English Digest</div>
        </div>
      </div>
      <div className="tb-center">
        <div className="tb-level">
          <span className="tb-level-ic">🎓</span>
          <span>B1 中级</span>
        </div>
        <div className="tb-xp">
          <div className="tb-xp-bar"><div className="tb-xp-fill" style={{ width: '65%' }} /></div>
          <div className="tb-xp-num">325/500 XP</div>
        </div>
      </div>
      <div className="tb-right">
        <div className="tb-stat tb-fire">🔥 7天</div>
        <button className="tb-btn" title="上传资料">📁</button>
        <button className="tb-btn" title="设置">⚙️</button>
      </div>
    </div>
  )
}
