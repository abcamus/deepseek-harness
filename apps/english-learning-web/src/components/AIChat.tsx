import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, SSEStatus } from '../types'

interface AIChatProps {
  messages: ChatMessage[]
  status: SSEStatus
  onSend: (text: string) => void | Promise<void>
}

export function AIChat({ messages, status, onSend }: AIChatProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = () => {
    if (input.trim() === '' || status !== 'connected') return
    void onSend(input.trim())
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const statusLabel = status === 'connected' ? '在线' : status === 'connecting' ? '连接中...' : '离线'

  return (
    <div className="ai-float">
      <button className="ai-btn" onClick={() => { setOpen(!open) }}>🤖</button>
      <div className={`ai-chat ${open ? 'open' : 'closed'}`}>
        <div className="ai-chat-header">
          <div className="ai-chat-avatar">🤖</div>
          <div className="ai-chat-title">AI 学习助手</div>
          <div className="ai-chat-status">{statusLabel}</div>
        </div>

        <div className="ai-chat-messages">
          {messages.length === 0 && (
            <div className="ai-msg">
              <div className="ai-msg-icon">💡</div>
              <div className="ai-msg-text">
                你好！我是你的 AI 学习助手。你可以问我任何英语学习相关的问题，或者让我帮你找学习资料。
              </div>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`ai-msg ${msg.role}`}>
              <div className="ai-msg-icon">{msg.role === 'user' ? '👤' : '🤖'}</div>
              <div className={`ai-msg-text ${msg.streaming ? 'streaming' : ''}`}>
                {msg.text}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="ai-chat-input">
          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value) }}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            disabled={status !== 'connected'}
          />
          <button onClick={handleSubmit} disabled={status !== 'connected' || input.trim() === ''}>
            发送
          </button>
        </div>

        <div className="ai-suggestions">
          <span className="ai-sug" onClick={() => { void onSend('帮我找一些 B1 级别的听力材料') }}>找资料</span>
          <span className="ai-sug" onClick={() => { void onSend('制定今日学习计划') }}>今日计划</span>
          <span className="ai-sug" onClick={() => { void onSend('复习今天学的单词') }}>词汇复习</span>
          <span className="ai-sug" onClick={() => { void onSend('模拟一段日常对话') }}>模拟对话</span>
        </div>
      </div>
    </div>
  )
}
