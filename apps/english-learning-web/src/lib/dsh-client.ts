/**
 * DSH client for english-learning-web.
 * WebSocket mux inlined from @deepseek-ai/dsh-api-gateway.
 * HTTP RPC follows the standard DSH client-request/server-response envelope.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SessionSummary {
  sessionId: string
  updatedAt: number
  running: boolean
  blank: boolean
  parentSessionId?: string
  origin?: 'subagent'
  cwd?: string
}

export interface SessionEvent {
  type: string
  seq: number
  time: number
  data: Record<string, unknown>
  turn?: number
  step?: number
}

/** One history record: a raw event or a packed Assistant delta run, both carrying the event inline. */
export type SessionHistoryRecord = { type: 'event' | 'chunks'; event: SessionEvent }

export interface SessionFollowSnapshot {
  type: 'snapshot'
  cursor: number
  records: readonly SessionHistoryRecord[]
  hasMore: boolean
  /** Projection baseline folded at the snapshot cut; only the durable title is consumed. */
  projections?: { values?: { title?: string | null } }
}

export interface SessionFollowEvent {
  type: 'event'
  event: SessionEvent
}

export type SessionFollowFrame = SessionFollowSnapshot | SessionFollowEvent

// ─── WebSocket Stream Client ─────────────────────────────────────────────────

const REMOTE_STREAM_MUX_PATH = '/api/remote.mux'
const RECONNECT_BASE_MS = 500
const RECONNECT_FACTOR = 2
const RECONNECT_MAX_MS = 10_000

type RemoteStreamServerMessage =
  | { readonly type: 'item'; readonly streamId: string; readonly value?: unknown }
  | { readonly type: 'error'; readonly streamId: string; readonly error: { code: string; message: string; details: object } }
  | { readonly type: 'end'; readonly streamId: string }

function parseRemoteStreamServerMessage(text: string): RemoteStreamServerMessage {
  const decoded = JSON.parse(text) as Record<string, unknown>
  if (typeof decoded !== 'object' || decoded === null) throw new Error('Remote stream message must be an object')
  if (decoded.type === 'item' && typeof decoded.streamId === 'string' && decoded.streamId.length > 0) {
    return decoded as unknown as RemoteStreamServerMessage
  }
  if (decoded.type === 'end' && typeof decoded.streamId === 'string' && decoded.streamId.length > 0) {
    return decoded as unknown as RemoteStreamServerMessage
  }
  if (decoded.type === 'error' && typeof decoded.streamId === 'string' && decoded.streamId.length > 0) {
    const error = decoded.error as Record<string, unknown>
    if (typeof error?.code === 'string' && typeof error?.message === 'string') {
      return decoded as unknown as RemoteStreamServerMessage
    }
  }
  throw new Error('Invalid Remote stream server message')
}

function randomUuid(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  view.setUint8(6, (view.getUint8(6) & 0x0f) | 0x40)
  view.setUint8(8, (view.getUint8(8) & 0x3f) | 0x80)
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

interface StreamInbox {
  frames: RemoteStreamServerMessage[]
  wake: (() => void) | undefined
  failure: Error | undefined
  push(frame: RemoteStreamServerMessage): void
  fail(error: unknown): void
  next(): Promise<RemoteStreamServerMessage>
}

function createStreamInbox(): StreamInbox {
  const inbox: StreamInbox = {
    frames: [],
    wake: undefined,
    failure: undefined,
    push(frame) {
      if (inbox.failure !== undefined) return
      inbox.frames.push(frame)
      inbox.wake?.()
      inbox.wake = undefined
    },
    fail(error) {
      if (inbox.failure !== undefined) return
      inbox.failure = error instanceof Error ? error : new Error(String(error), { cause: error })
      inbox.frames.length = 0
      inbox.wake?.()
      inbox.wake = undefined
    },
    async next() {
      while (inbox.frames.length === 0) {
        if (inbox.failure !== undefined) throw inbox.failure
        await new Promise<void>((resolve) => { inbox.wake = resolve })
      }
      return inbox.frames.shift() as RemoteStreamServerMessage
    },
  }
  return inbox
}

function backoffDelay(attempt: number): number {
  const cap = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * RECONNECT_FACTOR ** Math.max(0, attempt - 1))
  return cap / 2 + Math.random() * (cap / 2)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
    function done(): void {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

/**
 * Keep one physical WebSocket and share it among independently cancellable logical streams.
 * Inlined from @deepseek-ai/dsh-api-gateway/src/client/stream-client.ts.
 */
class RemoteStreamMuxClient {
  private socket: WebSocket | undefined
  private cancelCandidate: ((error: Error) => void) | undefined
  private keepAlive: Promise<void> | undefined
  private keepAliveAbort: AbortController | undefined
  private readonly streams = new Map<string, StreamInbox>()
  private readonly waiters = new Set<{ resolve(socket: WebSocket): void; reject(error: unknown): void }>()
  private running = false
  private disposed = false

  start(): void {
    if (this.running || this.disposed) return
    this.running = true
    this.maintain()
  }

  async *open(
    endpoint: string,
    payload: unknown,
    signal: AbortSignal,
  ): AsyncGenerator {
    console.log('[dsh-client] mux.open START:', endpoint)
    this.start()
    signal.throwIfAborted()
    const streamId = randomUuid()
    const inbox = createStreamInbox()
    let carrier: WebSocket | undefined
    let opened = false
    let terminal = false
    const abort = (): void => { inbox.fail(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    try {
      const socket = await this.waitForSocket(signal)
      signal.throwIfAborted()
      carrier = socket
      this.streams.set(streamId, inbox)
      console.log('[dsh-client] mux.open:', endpoint, JSON.stringify(payload))
      this.send(socket, { type: 'open', streamId, endpoint, payload })
      opened = true
      while (true) {
        const frame = await inbox.next()
        signal.throwIfAborted()
        if (frame.type === 'item') {
          yield frame.value
          continue
        }
        terminal = true
        if (frame.type === 'error') {
          console.error('[dsh-client] stream error frame:', JSON.stringify(frame.error, Object.getOwnPropertyNames(frame.error)))
          throw new Error(`Stream ${endpoint} failed: ${frame.error.message}`)
        }
        return
      }
    } finally {
      signal.removeEventListener('abort', abort)
      this.streams.delete(streamId)
      if (opened && !terminal && carrier?.readyState === WebSocket.OPEN) {
        this.send(carrier, { type: 'cancel', streamId })
      }
    }
  }

  async close(): Promise<void> {
    if (!this.disposed) {
      this.disposed = true
      this.running = false
      const error = new Error('Remote stream client disposed')
      this.keepAliveAbort?.abort(error)
      this.keepAliveAbort = undefined
      this.failAll(error)
      for (const waiter of [...this.waiters]) waiter.reject(error)
      this.cancelCandidate?.(error)
      const socket = this.socket
      this.socket = undefined
      socket?.close(1000, 'disposed')
    }
    await this.keepAlive
  }

  private connect(): Promise<WebSocket> {
    const location = (globalThis as { location?: { origin?: string } }).location
    const base = location?.origin !== undefined && location.origin !== 'null' ? location.origin : 'http://dsh.internal'
    const url = new URL(REMOTE_STREAM_MUX_PATH, base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url.href)
    const connecting = new Promise<WebSocket>((resolve, reject) => {
      let settled = false
      const rejectCandidate = (error: Error): void => {
        settled = true
        socket.removeEventListener('open', opened)
        socket.removeEventListener('error', failed)
        socket.removeEventListener('message', received)
        socket.removeEventListener('close', closed)
        this.cancelCandidate = undefined
        socket.close()
        reject(error)
      }
      const opened = (): void => {
        settled = true
        this.cancelCandidate = undefined
        this.socket = socket
        for (const waiter of [...this.waiters]) waiter.resolve(socket)
        resolve(socket)
      }
      const failed = (): void => {
        if (!settled) {
          rejectCandidate(new Error('Remote stream WebSocket failed to open'))
          return
        }
        const error = new Error('Remote stream WebSocket failed')
        this.lost(socket, error)
        socket.close()
      }
      const closed = (): void => {
        if (!settled) {
          rejectCandidate(new Error('Remote stream WebSocket closed before opening'))
          return
        }
        this.lost(socket)
      }
      const received = (event: MessageEvent): void => { this.receive(socket, event.data) }
      this.cancelCandidate = rejectCandidate
      socket.addEventListener('open', opened, { once: true })
      socket.addEventListener('error', failed, { once: true })
      socket.addEventListener('message', received)
      socket.addEventListener('close', closed, { once: true })
    })
    return connecting
  }

  private waitForSocket(signal: AbortSignal): Promise<WebSocket> {
    signal.throwIfAborted()
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket)
    if (this.disposed) return Promise.reject(new Error('Remote stream client disposed'))
    this.start()
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (socket: WebSocket) => {
          cleanup()
          resolve(socket)
        },
        reject: (error: unknown) => {
          cleanup()
          reject(error)
        },
      }
      const cleanup = (): void => {
        this.waiters.delete(waiter)
        signal.removeEventListener('abort', aborted)
      }
      const aborted = (): void => { waiter.reject(signal.reason) }
      this.waiters.add(waiter)
      signal.addEventListener('abort', aborted, { once: true })
    })
  }

  private receive(socket: WebSocket, data: unknown): void {
    if (socket !== this.socket) return
    try {
      if (typeof data !== 'string') throw new Error('Remote stream WebSocket requires text messages')
      const frame = parseRemoteStreamServerMessage(data)
      this.streams.get(frame.streamId)?.push(frame)
    } catch (error) {
      const failure = new Error('Invalid Remote stream frame', { cause: error })
      this.failAll(failure)
      this.lost(socket, failure)
      socket.close(4002, 'invalid Remote stream frame')
    }
  }

  private lost(
    socket: WebSocket,
    error: Error = new Error('Remote stream WebSocket closed'),
  ): void {
    if (this.socket !== socket) return
    this.socket = undefined
    this.failAll(error)
    this.maintain(error)
  }

  private maintain(previousFailure?: Error): void {
    if (!this.running) return
    if (this.keepAlive !== undefined) {
      void this.keepAlive.then(() => { this.maintain(previousFailure) })
      return
    }
    const abort = new AbortController()
    this.keepAliveAbort = abort
    const task = this.reconnect(abort.signal, previousFailure)
    this.keepAlive = task
    void task.then(() => {
      this.keepAlive = undefined
      this.keepAliveAbort = undefined
    })
  }

  private async reconnect(signal: AbortSignal, previousFailure?: Error): Promise<void> {
    let attempt = 0
    let failure = previousFailure
    while (this.running && !signal.aborted && this.socket?.readyState !== WebSocket.OPEN) {
      if (failure !== undefined) {
        attempt += 1
        console.warn(`[dsh-client] Remote stream connection unavailable, retry #${String(attempt)}`, failure)
        await sleep(backoffDelay(attempt), signal)
        if (signal.aborted) return
      }
      try {
        await this.connect()
        return
      } catch (error) {
        if (signal.aborted) return
        failure = error as Error
      }
    }
  }

  private failAll(error: unknown): void {
    for (const stream of this.streams.values()) stream.fail(error)
  }

  private send(socket: WebSocket, message: unknown): void {
    socket.send(JSON.stringify(message))
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * WebSocket mux client for opening logical streams over a persistent connection.
 */
export class DshStreamClient {
  private readonly mux: RemoteStreamMuxClient

  constructor(_baseUrl: string) {
    this.mux = new RemoteStreamMuxClient()
  }

  start(): void {
    this.mux.start()
  }

  async *openStream<T>(endpoint: string, payload: unknown, signal: AbortSignal): AsyncGenerator<T> {
    for await (const value of this.mux.open(endpoint, payload, signal)) {
      yield value as T
    }
  }

  async dispose(): Promise<void> {
    await this.mux.close()
  }
}

/**
 * HTTP RPC client using the standard DSH client-request/server-response envelope.
 */
export class DshRpcClient {
  private rpcId = 0

  constructor(private baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async call<T>(endpoint: string, args: unknown): Promise<T> {
    this.rpcId += 1
    const rpcId = `rpc-${this.rpcId}-${Date.now()}`

    const body = {
      type: 'client-request',
      rpcId,
      method: endpoint,
      payload: { args },
    }

    const response = await fetch(`${this.baseUrl}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error(`RPC ${endpoint} failed: HTTP ${response.status}`)
    }

    const envelope = await response.json() as {
      type: string
      rpcId: string
      result: { ok: true; value: T } | { ok: false; error: { code: string; message: string; details: unknown } }
    }

    if (envelope.type !== 'server-response') {
      throw new Error(`RPC ${endpoint}: unexpected response type: ${envelope.type}`)
    }

    if (envelope.rpcId !== rpcId) {
      throw new Error(`RPC ${endpoint}: rpcId mismatch`)
    }

    if (!envelope.result.ok) {
      throw new Error(`RPC ${endpoint}: ${envelope.result.error.message}`)
    }

    return envelope.result.value
  }

  async listSessions(): Promise<SessionSummary[]> {
    const result = await this.call<{ items: SessionSummary[] }>('session/list', { _request: {} })
    return result.items ?? []
  }

  /** One backwards history page; `throughSeq` is the inclusive log cut from the follow opening snapshot. */
  async getSessionPage(address: { sessionId: string }, throughSeq: number): Promise<{
    records: SessionEvent[]
    hasMore: boolean
  }> {
    const result = await this.call<{ records: SessionHistoryRecord[]; hasMore: boolean }>('session/page', {
      request: { address: { kind: 'session' as const, sessionId: address.sessionId }, throughSeq },
    })
    return { records: result.records.map(record => record.event), hasMore: result.hasMore }
  }
}

// ─── Session Event Stream ────────────────────────────────────────────────────

export interface SessionEventStreamOptions {
  publish: (change: SessionEventChange) => void
  failed: (error: unknown) => void
}

export type SessionEventChange =
  | { type: 'replace'; entries: SessionEvent[]; hasMore: boolean }
  | { type: 'prepend'; entries: SessionEvent[]; hasMore: boolean }
  | { type: 'append'; entry: SessionEvent }

/**
 * Manages a session event journal stream via WebSocket.
 */
export class SessionEventStream {
  private entries: SessionEvent[] = []
  private hasMore = false
  private signal: AbortController | null = null
  private options: SessionEventStreamOptions

  constructor(private streamClient: DshStreamClient, options: SessionEventStreamOptions) {
    this.options = options
  }

  async open(sessionId: string, signal: AbortSignal): Promise<void> {
    console.log('[dsh-client] SessionEventStream.open:', sessionId)
    this.signal = new AbortController()
    const combined = AbortSignal.any([signal, this.signal.signal])

    try {
      for await (const frame of this.streamClient.openStream<SessionFollowFrame>(
        'session/follow',
        { args: { request: { address: { kind: 'session' as const, sessionId }, maxMessages: 50 } } },
        combined,
      )) {
        if (frame.type === 'snapshot') {
          this.entries = frame.records.map(record => record.event)
          this.hasMore = frame.hasMore
          this.options.publish({
            type: 'replace',
            entries: this.entries,
            hasMore: this.hasMore,
          })
        } else if (frame.type === 'event') {
          this.entries.push(frame.event)
          this.options.publish({
            type: 'append',
            entry: frame.event,
          })
        }
      }
    } catch (error) {
      if (combined.aborted) return
      console.error('[dsh-client] SessionEventStream.open error:', error)
      this.options.failed(error)
    }
  }

  cancel(): void {
    this.signal?.abort()
    this.signal = null
  }

  getSnapshot(): SessionEvent[] {
    return this.entries
  }
}

// ─── Session Titles ──────────────────────────────────────────────────────────

/** One host-wide control snapshot entry for a live session. */
export interface SessionControlProjectionSnapshot {
  asOfSeq: number
  values: { title?: string | null } & Record<string, unknown>
}

export type SessionControlFrame =
  | { type: 'baseline'; value: { projections: Record<string, SessionControlProjectionSnapshot> } }
  | { type: 'projection'; sessionId: string; key: string; value: unknown; seq: number }
  | { type: 'queue'; sessionId: string }
  | { type: 'jobs'; sessionId: string }

export interface SessionTitleStreamOptions {
  /** Receive one title per session; null means the session has no durable title. */
  onTitle: (sessionId: string, title: string | null) => void
  failed: (error: unknown) => void
}

/**
 * Consume the host-wide session/control stream and surface durable titles as they change.
 * The opening baseline covers only live sessions; cold sessions are filled by fetchSessionTitle.
 */
export class SessionTitleStream {
  constructor(private streamClient: DshStreamClient, private options: SessionTitleStreamOptions) {}

  async open(signal: AbortSignal): Promise<void> {
    try {
      for await (const frame of this.streamClient.openStream<SessionControlFrame>(
        'session/control',
        { args: {} },
        signal,
      )) {
        if (frame.type === 'baseline') {
          for (const [sessionId, projection] of Object.entries(frame.value.projections)) {
            this.options.onTitle(sessionId, projection.values?.title ?? null)
          }
        } else if (frame.type === 'projection' && frame.key === 'title') {
          this.options.onTitle(frame.sessionId, typeof frame.value === 'string' ? frame.value : null)
        }
      }
    } catch (error) {
      if (signal.aborted) return
      console.error('[dsh-client] SessionTitleStream.open error:', error)
      this.options.failed(error)
    }
  }
}

/**
 * Read one session's durable title from a short-lived follow snapshot; null when untitled.
 * Cold sessions are absent from the control baseline, so the session list fills them lazily.
 */
export async function fetchSessionTitle(
  streamClient: DshStreamClient,
  sessionId: string,
  signal: AbortSignal,
): Promise<string | null> {
  for await (const frame of streamClient.openStream<SessionFollowFrame>(
    'session/follow',
    { args: { request: { address: { kind: 'session' as const, sessionId }, maxMessages: 1 } } },
    signal,
  )) {
    if (frame.type === 'snapshot') {
      const title = frame.projections?.values?.title
      return typeof title === 'string' ? title : null
    }
  }
  return null
}
