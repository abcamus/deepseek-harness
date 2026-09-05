/**
 * React hook for connecting to a DSH backend and managing session trajectory.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DshStreamClient,
  DshRpcClient,
  SessionEventStream,
  SessionTitleStream,
  fetchSessionTitle,
  type SessionSummary,
  type SessionEvent,
  type SessionEventChange,
} from './dsh-client'
import { buildTrajectorySnapshot, type TrajectorySnapshot } from './trajectory-builder'

export interface UseDshTrajectoryOptions {
  /** DSH web server base URL, e.g. "http://localhost:3000". */
  baseUrl: string
}

export interface DshTrajectoryState {
  /** Available sessions from the DSH server. */
  sessions: SessionSummary[]
  /** Durable title per session; null means the session has no title. */
  titles: Record<string, string | null>
  /** Currently selected session ID. */
  selectedSessionId: string | null
  /** The raw trajectory snapshot for rendering. */
  snapshot: TrajectorySnapshot | null
  /** Whether we are connected to the DSH server. */
  connected: boolean
  /** Whether a session follow stream is active. */
  streaming: boolean
  /** Error message, if any. */
  error: string | null
  /** Reconnect attempt counter. */
  reconnectCount: number
}

export interface DshTrajectoryActions {
  /** Fetch session list from the server. */
  refreshSessions: () => Promise<void>
  /** Select a session and start streaming its trajectory. */
  selectSession: (sessionId: string) => void
  /** Disconnect from the server. */
  disconnect: () => void
}

export function useDshTrajectory(
  options: UseDshTrajectoryOptions,
): [DshTrajectoryState, DshTrajectoryActions] {
  const { baseUrl } = options

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [titles, setTitles] = useState<Record<string, string | null>>({})
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<TrajectorySnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reconnectCount, setReconnectCount] = useState(0)

  const streamClientRef = useRef<DshStreamClient | null>(null)
  const rpcClientRef = useRef<DshRpcClient | null>(null)
  const eventStreamRef = useRef<SessionEventStream | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mirror of titles for synchronous lookups inside callbacks.
  const titlesRef = useRef<Record<string, string | null>>({})
  // Abort controller for the title streams — recreated per connection.
  const auxAbortRef = useRef<AbortController | null>(null)
  // Sessions whose durable title has already been probed with a cold follow.
  const probedRef = useRef<Set<string>>(new Set())

  const applyTitle = useCallback((sessionId: string, title: string | null) => {
    if (titlesRef.current[sessionId] === title) return
    titlesRef.current = { ...titlesRef.current, [sessionId]: title }
    setTitles(titlesRef.current)
  }, [])

  /**
   * Fill titles the control baseline does not carry: cold sessions need one short-lived
   * follow snapshot each. Probed sessions are remembered so list polls do not re-probe.
   */
  const fillMissingTitles = useCallback((list: SessionSummary[]) => {
    const stream = streamClientRef.current
    const controller = auxAbortRef.current
    if (!stream || !controller || controller.signal.aborted) return
    const pending = list.filter(session =>
      !(session.sessionId in titlesRef.current) && !probedRef.current.has(session.sessionId))
    if (pending.length === 0) return
    for (const session of pending) probedRef.current.add(session.sessionId)

    void (async () => {
      let index = 0
      const worker = async (): Promise<void> => {
        while (index < pending.length && !controller.signal.aborted) {
          const session = pending[index]!
          index += 1
          try {
            applyTitle(session.sessionId, await fetchSessionTitle(stream, session.sessionId, controller.signal))
          } catch (err) {
            if (controller.signal.aborted) return
            console.debug('[Trajectory] title fetch failed:', session.sessionId, err)
            probedRef.current.delete(session.sessionId)
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker))
    })()
  }, [applyTitle])

  // Stable refs for callbacks
  const baseUrlRef = useRef(baseUrl)
  baseUrlRef.current = baseUrl

  // Initialize clients on mount or baseUrl change
  useEffect(() => {
    const stream = new DshStreamClient(baseUrl)
    const rpc = new DshRpcClient(baseUrl)

    streamClientRef.current = stream
    rpcClientRef.current = rpc

    stream.start()

    return () => {
      stream.dispose()
      streamClientRef.current = null
      rpcClientRef.current = null
    }
  }, [baseUrl])

  // Track connection state via RPC
  useEffect(() => {
    let mounted = true
    let retryCount = 0
    let stopRetrying = false

    const checkConnection = async () => {
      if (!mounted || stopRetrying) return

      const rpc = rpcClientRef.current
      if (!rpc) return

      try {
        const sessions = await rpc.listSessions()
        if (mounted) {
          setSessions(sessions)
          fillMissingTitles(sessions)
          setConnected(true)
          setError(null)
          retryCount = 0
        }
      } catch (err) {
        if (mounted) {
          setConnected(false)
          const errorMsg = err instanceof Error ? err.message : String(err)
          console.log('[Trajectory] Connection check failed:', errorMsg)

          // Check if this is a 404 error (endpoint not found)
          const is404 = errorMsg.includes('404')
          if (is404) {
            setError('Session controller not available. Please restart the DSH server.')
            stopRetrying = true
            return
          }

          // Check if this is a 401 error (authentication required)
          const is401 = errorMsg.includes('401')
          if (is401) {
            setError('Authentication required. Please visit the root URL first to authenticate.')
            stopRetrying = true
            return
          }

          // Check if this is a 405 error (DSH connection plugin not loaded)
          const is405 = errorMsg.includes('405')
          if (is405) {
            setError('DSH connection plugin not available in this profile')
            stopRetrying = true
            return
          }

          // Exponential backoff retry for other errors
          retryCount++
          const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000)
          retryTimerRef.current = setTimeout(checkConnection, delay)
        }
      }
    }

    // Start checking immediately
    checkConnection()

    // Poll every 5s when connected
    const timer = setInterval(() => {
      if (connected && !stopRetrying) {
        checkConnection()
      }
    }, 5000)

    return () => {
      mounted = false
      clearInterval(timer)
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
      }
    }
  }, [baseUrl, connected, fillMissingTitles])

  const refreshSessions = useCallback(async () => {
    const rpc = rpcClientRef.current
    if (!rpc) return

    try {
      const list = await rpc.listSessions()
      setSessions(list)
      fillMissingTitles(list)
      setError(null)
    } catch (err) {
      setError(`Failed to load sessions: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [fillMissingTitles])

  // Fetch sessions on connect
  useEffect(() => {
    if (connected) {
      refreshSessions()
    }
  }, [connected, refreshSessions])

  // Durable session titles: the control stream covers live sessions; fillMissingTitles
  // probes cold sessions with one short-lived follow each.
  useEffect(() => {
    if (!connected) return
    const stream = streamClientRef.current
    if (!stream) return

    const controller = new AbortController()
    auxAbortRef.current = controller

    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const titleStream = new SessionTitleStream(stream, {
      onTitle: applyTitle,
      failed: (err) => {
        if (controller.signal.aborted) return
        console.warn('[Trajectory] session title stream failed:', err)
        retryTimer = setTimeout(() => {
          if (!controller.signal.aborted) titleStream.open(controller.signal)
        }, 5000)
      },
    })
    titleStream.open(controller.signal)

    return () => {
      controller.abort()
      if (auxAbortRef.current === controller) auxAbortRef.current = null
      if (retryTimer !== null) clearTimeout(retryTimer)
      probedRef.current = new Set()
    }
  }, [connected, baseUrl, applyTitle])

  const selectSession = useCallback((sessionId: string) => {
    console.log('[Trajectory] selectSession called:', sessionId)
    // Cancel previous stream
    abortRef.current?.abort()
    eventStreamRef.current?.cancel()

    setSelectedSessionId(sessionId)
    setSnapshot(null)
    setError(null)
    setStreaming(false)

    if (!sessionId) return

    const stream = streamClientRef.current
    if (!stream) return

    const controller = new AbortController()
    abortRef.current = controller

    const events: SessionEvent[] = []

    const eventStream = new SessionEventStream(stream, {
      publish: (change: SessionEventChange) => {
        if (change.type === 'replace') {
          events.length = 0
          events.push(...change.entries)
        } else if (change.type === 'prepend') {
          events.unshift(...change.entries)
        } else if (change.type === 'append') {
          events.push(change.entry)
        }

        // Rebuild snapshot
        setSnapshot(buildTrajectorySnapshot([...events]))
        setStreaming(true)
      },
      failed: (err: unknown) => {
        if (controller.signal.aborted) return
        console.error('[Trajectory] stream failed:', err)
        setStreaming(false)
        setError(`Stream failed: ${err instanceof Error ? err.message : String(err)}`)

        // Auto-retry after 3s
        setReconnectCount((c) => c + 1)
        setTimeout(() => {
          if (!controller.signal.aborted) {
            selectSession(sessionId)
          }
        }, 3000)
      },
    })

    eventStreamRef.current = eventStream
    eventStream.open(sessionId, controller.signal)
  }, [])

  const disconnect = useCallback(() => {
    abortRef.current?.abort()
    eventStreamRef.current?.cancel()
    setSelectedSessionId(null)
    setSnapshot(null)
    setStreaming(false)
  }, [])

  const state: DshTrajectoryState = {
    sessions,
    titles,
    selectedSessionId,
    snapshot,
    connected,
    streaming,
    error,
    reconnectCount,
  }

  const actions: DshTrajectoryActions = {
    refreshSessions,
    selectSession,
    disconnect,
  }

  return [state, actions]
}
