import { useState, useRef, useCallback, useEffect } from 'react'
import type { ChatMessage, SSEStatus } from '../types'

export function useSSE() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<SSEStatus>('connecting')
  const evtSourceRef = useRef<EventSource | null>(null)
  const streamingIdRef = useRef<string | null>(null)

  useEffect(() => {
    const connect = () => {
      const es = new EventSource('/api/events')
      evtSourceRef.current = es

      es.onopen = () => { setStatus('connected') }

      es.onerror = () => {
        setStatus('disconnected')
        es.close()
        setTimeout(connect, 3000)
      }

      es.addEventListener('chunk', ((e: MessageEvent) => {
        const data = JSON.parse(e.data as string) as { text: string }
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last !== undefined && last.role === 'assistant' && last.streaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: last.text + data.text },
            ]
          }
          const id = `assistant-${Date.now()}`
          streamingIdRef.current = id
          return [...prev, { id, role: 'assistant', text: data.text, streaming: true }]
        })
      }) as EventListener)

      es.addEventListener('message', ((e: MessageEvent) => {
        const data = JSON.parse(e.data as string) as { text: string }
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last !== undefined && last.role === 'assistant' && last.streaming) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: data.text, streaming: false },
            ]
          }
          if (data.text) {
            return [...prev, { id: `assistant-${Date.now()}`, role: 'assistant', text: data.text }]
          }
          return prev
        })
        streamingIdRef.current = null
      }) as EventListener)

      es.addEventListener('done', () => {
        streamingIdRef.current = null
      })

      es.addEventListener('error', ((e: MessageEvent) => {
        const data = JSON.parse(e.data as string) as { error: string }
        console.error('agent error:', data.error)
      }) as EventListener)
    }

    connect()

    return () => {
      evtSourceRef.current?.close()
    }
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (text.trim() === '') return

    setMessages(prev => [...prev, { id: `user-${Date.now()}`, role: 'user', text }])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => undefined) as { error?: string } | undefined
        const reason = data?.error ?? `HTTP ${String(response.status)}`
        setMessages(prev => [...prev, { id: `error-${Date.now()}`, role: 'assistant', text: `⚠️ 发送失败：${reason}` }])
      }
    } catch (err) {
      console.error('send failed:', err)
    }
  }, [])

  return { messages, status, sendMessage }
}
