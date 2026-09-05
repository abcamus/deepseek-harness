/**
 * Build trajectory view data from session events.
 * Aligned with @deepseek-ai/dsh-client-ui-trajectory types.
 */

// ─── Types (aligned with ui-trajectory) ──────────────────────────────────────

export type TrajectoryCellKind =
  | 'system'
  | 'user'
  | 'context'
  | 'compacted'
  | 'message'
  | 'tool'
  | 'subtool'

export interface TrajectoryCellProps {
  index: number
  recordId?: string
  kind: TrajectoryCellKind
  text: string
  previewMarkdown?: string
  opensTurn?: boolean
  sourceSeq?: number
  messageSource?: unknown
  requestOnly?: boolean
  inputDetail?: string
  outputDetail?: string
  thinkingDetail?: string
  callId?: string
  toolName?: string
  result?: string
  resultPreviewMarkdown?: string
  isError?: boolean
  timeSeconds: number | null
  startedAt?: number | null
  input?: number
  cacheRead?: number
  cacheWrite?: number
  output?: number
  think?: number
}

export interface TrajectoryGroupModel {
  title: string
  description?: string
  cells: readonly TrajectoryCellProps[]
}

export interface TrajectoryTurnModel {
  turn: number | null
  groups: readonly TrajectoryGroupModel[]
}

/** Simplified snapshot compatible with ui-trajectory's TrajectorySnapshot. */
export interface TrajectorySnapshot {
  readonly turns: readonly TrajectoryTurnModel[]
  readonly totalCells: number
  readonly totalDuration: number
}

// ─── Event Processing ────────────────────────────────────────────────────────

interface SessionEvent {
  type: string
  seq: number
  time: number
  data: Record<string, unknown>
  turn?: number
  step?: number
}

interface EventAccumulator {
  turns: Map<number, {
    cells: TrajectoryCellProps[]
    startTime: number
    lastTime: number
  }>
  cellIndex: number
  pendingToolCalls: Map<string, { name: string; turn: number; step: number; startTime: number }>
}

function getOrCreateTurn(acc: EventAccumulator, turn: number | undefined): {
  cells: TrajectoryCellProps[]
  startTime: number
  lastTime: number
} {
  const turnNum = turn ?? 0
  let turnData = acc.turns.get(turnNum)
  if (!turnData) {
    turnData = { cells: [], startTime: 0, lastTime: 0 }
    acc.turns.set(turnNum, turnData)
  }
  return turnData
}

function extractText(data: Record<string, unknown>): string {
  if (typeof data.text === 'string') return data.text
  if (typeof data.content === 'string') return data.content
  if (Array.isArray(data.content)) {
    return data.content
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text)
      .join('')
  }
  if (data.message && typeof data.message === 'object') {
    const msg = data.message as Record<string, unknown>
    if (typeof msg.content === 'string') return msg.content
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((c: { type: string }) => c.type === 'text')
        .map((c: { text: string }) => c.text)
        .join('')
    }
  }
  if (Array.isArray(data.blocks)) {
    return data.blocks
      .filter((b: { kind: string }) => b.kind === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
  }
  if (data.chunk && typeof data.chunk === 'object') {
    const chunk = data.chunk as Record<string, unknown>
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') return chunk.text
  }
  return JSON.stringify(data).slice(0, 200)
}

function calculateDuration(startTime: number, endTime: number): number {
  if (startTime === 0 || endTime === 0) return 0
  return Math.max(0, (endTime - startTime) / 1000)
}

export function buildTrajectorySnapshot(events: SessionEvent[]): TrajectorySnapshot {
  const acc: EventAccumulator = {
    turns: new Map(),
    cellIndex: 0,
    pendingToolCalls: new Map(),
  }

  for (const event of events) {
    const turnNum = event.turn ?? 0
    const turn = getOrCreateTurn(acc, event.turn)

    switch (event.type) {
      case 'user/message': {
        turn.startTime = event.time
        turn.lastTime = event.time
        acc.cellIndex += 1
        turn.cells.push({
          index: acc.cellIndex,
          kind: 'user',
          text: extractText(event.data),
          timeSeconds: 0,
          startedAt: event.time,
          sourceSeq: event.seq,
          opensTurn: true,
        })
        break
      }

      case 'assistant/chunk': {
        turn.lastTime = event.time
        break
      }

      case 'assistant/message': {
        turn.lastTime = event.time
        const duration = calculateDuration(turn.startTime, event.time)
        const text = extractText(event.data)
        const usage = event.data.usage as {
          inputTokens?: number
          cacheReadTokens?: number
          cacheWriteTokens?: number
          outputTokens?: number
          reasoningTokens?: number
        } | undefined

        acc.cellIndex += 1
        const previewText = text || undefined
        const detailText = text || undefined
        const cell: TrajectoryCellProps = {
          index: acc.cellIndex,
          recordId: `assistant\u0000${turnNum}\u0000${event.step ?? 0}`,
          kind: 'message',
          text: text || '(empty response)',
          sourceSeq: event.seq,
          timeSeconds: duration > 0 ? duration : null,
          startedAt: turn.startTime > 0 ? turn.startTime : null,
          ...(previewText !== undefined ? { previewMarkdown: previewText } : {}),
          ...(detailText !== undefined ? { outputDetail: detailText } : {}),
        }
        if (usage?.inputTokens != null) cell.input = usage.inputTokens
        if (usage?.cacheReadTokens != null) cell.cacheRead = usage.cacheReadTokens
        if (usage?.cacheWriteTokens != null) cell.cacheWrite = usage.cacheWriteTokens
        if (usage?.outputTokens != null) cell.output = usage.outputTokens
        if (usage?.reasoningTokens != null) cell.think = usage.reasoningTokens
        turn.cells.push(cell)

        turn.startTime = event.time
        break
      }

      case 'tool/call': {
        turn.lastTime = event.time
        const callId = event.data.callId as string
        const name = event.data.name as string
        acc.pendingToolCalls.set(callId, {
          name,
          turn: turnNum,
          step: (event.step as number) ?? 0,
          startTime: event.time,
        })
        break
      }

      case 'tool/result': {
        turn.lastTime = event.time
        const callId = (event.data.callId as string) ??
          (event.data.message as Record<string, unknown>)?.callId as string
        const pending = acc.pendingToolCalls.get(callId)

        const duration = pending ? calculateDuration(pending.startTime, event.time) : 0
        const isError = event.data.isError === true || (event.data.error != null)
        const resultText = extractText(event.data)

        acc.cellIndex += 1
        const toolPreview = resultText || undefined
        const toolResult = resultText || undefined
        const toolName = pending?.name
        turn.cells.push({
          index: acc.cellIndex,
          kind: 'tool',
          text: pending?.name ?? 'unknown',
          callId,
          sourceSeq: event.seq,
          isError,
          timeSeconds: duration > 0 ? duration : null,
          startedAt: pending?.startTime && pending.startTime > 0 ? pending.startTime : null,
          ...(toolName !== undefined ? { toolName } : {}),
          ...(toolPreview !== undefined ? { previewMarkdown: toolPreview } : {}),
          ...(toolResult !== undefined ? { result: toolResult } : {}),
          ...(toolResult !== undefined ? { resultPreviewMarkdown: toolResult } : {}),
          ...(toolResult !== undefined ? { outputDetail: toolResult } : {}),
        })

        acc.pendingToolCalls.delete(callId)
        break
      }

      case 'turn/start': {
        turn.startTime = event.time
        turn.lastTime = event.time
        break
      }

      case 'turn/end': {
        turn.lastTime = event.time
        break
      }

      case 'step/start': {
        turn.startTime = event.time
        break
      }

      case 'step/end': {
        turn.lastTime = event.time
        break
      }

      case 'compaction/start':
      case 'compaction/end': {
        acc.cellIndex += 1
        turn.cells.push({
          index: acc.cellIndex,
          kind: 'compacted',
          text: `${event.type}: ${JSON.stringify(event.data).slice(0, 100)}`,
          sourceSeq: event.seq,
          timeSeconds: 0,
          startedAt: event.time,
        })
        break
      }

      default: {
        if (event.type.startsWith('request/')) {
          acc.cellIndex += 1
          turn.cells.push({
            index: acc.cellIndex,
            kind: 'system',
            text: `${event.type}: ${JSON.stringify(event.data).slice(0, 100)}`,
            sourceSeq: event.seq,
            timeSeconds: 0,
            startedAt: event.time,
          })
        }
        break
      }
    }
  }

  // Convert map to sorted turn models
  const turns: TrajectoryTurnModel[] = []
  const sortedTurnNums = Array.from(acc.turns.keys()).sort((a, b) => a - b)

  for (const turnNum of sortedTurnNums) {
    const turnData = acc.turns.get(turnNum)!
    if (turnData.cells.length === 0) continue

    const totalDuration = turnData.cells.reduce((sum, c) => sum + (c.timeSeconds ?? 0), 0)

    turns.push({
      turn: turnNum || null,
      groups: [{
        title: turnNum > 0 ? `Turn ${turnNum}` : 'Prologue',
        description: `${turnData.cells.length} events${totalDuration > 0 ? ` · ${totalDuration.toFixed(1)}s` : ''}`,
        cells: turnData.cells,
      }],
    })
  }

  const totalCells = turns.reduce(
    (sum, t) => sum + t.groups.reduce((s, g) => s + g.cells.length, 0), 0,
  )
  const totalDuration = turns.reduce(
    (sum, t) => sum + t.groups.reduce(
      (s, g) => s + g.cells.reduce((cs, c) => cs + (c.timeSeconds ?? 0), 0), 0,
    ), 0,
  )

  return { turns, totalCells, totalDuration }
}
