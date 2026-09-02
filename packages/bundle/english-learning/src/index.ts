/**
 * @deepseek-ai/dsh-english-learning — English Learning Agent bundle
 *
 * Provides a complete agent composition for English learning:
 * - Core agent loop, session, LLM (DeepSeek)
 * - Web search (DeepSeek) and fetch for finding learning materials
 * - Skill system with filesystem discovery (loads preset skills)
 * - Filesystem tools for reading/writing materials
 * - Compaction for long sessions
 * - Web dashboard with LLM chat interface
 *
 * English learning skills (material-digest, knowledge-extractor, exercise-generator, material-search)
 * are loaded from the preset's skills/ directory via skill-filesystem.
 *
 * @module @deepseek-ai/dsh-english-learning
 */

import { exec } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent'

/** Stable Cordis plugin name. */
export const name = 'english-learning'

/** Core services required by this bundle's plugin. */
export const inject = ['tools', 'skills', 'web', 'webServer', 'agents', 'llm', 'settings', 'agentDefaultModel'] as const

/** Settings namespace for the english-learning model list. */
const NS = settingsNamespace('english-learning')

/** Schema for the added-models list stored in settings.yaml. */
const ADDED_MODELS_SCHEMA = z.object({
  addedModels: z.array(z.object({
    provider: z.string().required(),
    model: z.string().required(),
    name: z.string().required(),
    description: z.string(),
  })),
})

/** Shape of the english-learning settings section. */
interface AddedModelsSettings {
  addedModels: Array<{ provider: string; model: string; name: string; description?: string }>
}

/** Persistent agent handle for the chat session. */
interface ChatAgent {
  readonly sessionId: string
  readonly agentId: string
  readonly followup: (message: ReturnType<typeof createUserMessage>) => void
  readonly dispose: () => Promise<void>
}

/** Resolve the absolute path to the built web frontend dist/index.html. */
function resolveDistIndex(): string {
  const require = createRequire(import.meta.url)
  return join(
    dirname(require.resolve('@deepseek-ai/dsh-english-learning-web/package.json')),
    'dist', 'index.html',
  )
}

/** MIME types for static assets. */
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

/** Open a URL in the default browser using platform-specific commands. */
function openBrowser(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = process.platform
    const cmd =
      platform === 'darwin' ? 'open'
        : platform === 'win32' ? 'start ""'
          : 'xdg-open'
    exec(`${cmd} "${url}"`, (error) => {
      if (error !== null) reject(error)
      else resolve()
    })
  })
}

/** Read the full body of an incoming HTTP request as a string. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')) })
    req.on('error', reject)
  })
}

/**
 * English Learning Agent bundle plugin.
 * The bundle's composition is defined in cordis.patch.yml.
 * Registers a web dashboard with LLM chat and opens the browser on startup.
 */
export function apply(ctx: Context): void {
  console.log('[english-learning] English Learning Agent bundle loaded')

  // Resolve the dist directory at load time
  const distIndex = resolveDistIndex()
  const distRoot = dirname(distIndex)

  // Persistent agent for the chat session
  let chatAgent: ChatAgent | undefined

  // SSE clients
  const sseClients = new Set<ServerResponse>()

  /** Broadcast an SSE event to all connected clients. */
  function broadcast(event: string, data: Record<string, unknown>): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const client of sseClients) {
      if (!client.destroyed) client.write(payload)
    }
  }

  // Register the added-models settings section.
  const defaultAddedModels: AddedModelsSettings = { addedModels: [] }
  let addedModelsSource: AddedModelsSettings = defaultAddedModels

  // Capture webServer reference before inject (sctx may not have it)
  const webServerRef = ctx.webServer

  const scope = ctx.settings.register(NS, ADDED_MODELS_SCHEMA, { base: { addedModels: [] } })

  function syncSource(): void {
    const models = scope.get()
    addedModelsSource = { addedModels: models.addedModels }
  }
  syncSource()
  ctx.effect(() => () => { addedModelsSource = defaultAddedModels })
  scope.watch(() => { syncSource() })

  // Settings model endpoint: saves the user's active model selection
  ctx.effect(() => webServerRef.register({
    kind: 'exact',
    path: '/api/settings/model',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      try {
        const body = JSON.parse(await readBody(req)) as { provider?: string; model?: string }
        if (typeof body.provider !== 'string' || typeof body.model !== 'string') {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing provider or model' }))
          return
        }
        await ctx.agentDefaultModel.saveSelection({ provider: body.provider, model: body.model })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true, selection: { provider: body.provider, model: body.model } }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`english-learning: settings model error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'english-learning: settings model endpoint')

  // Added models endpoint: GET reads, POST adds, DELETE removes
  ctx.effect(() => webServerRef.register({
    kind: 'exact',
    path: '/api/models/added',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      try {
        if (req.method === 'GET') {
          const addedModels = addedModelsSource.addedModels
          const sel = ctx.agentDefaultModel.currentSelection()
          const activeModel = (sel.provider && sel.model) ? { provider: sel.provider, model: sel.model } : undefined
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ addedModels, activeModel }))
          return
        }
        if (req.method === 'POST') {
          const body = JSON.parse(await readBody(req)) as {
            provider?: string
            model?: string
            name?: string
            description?: string
          }
          if (typeof body.provider !== 'string' || typeof body.model !== 'string' || typeof body.name !== 'string') {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing provider, model, or name' }))
            return
          }
          const current = addedModelsSource
          const exists = current.addedModels.some(m => m.provider === body.provider && m.model === body.model)
          const nextModels = exists
            ? current.addedModels
            : [...current.addedModels, {
              provider: body.provider,
              model: body.model,
              name: body.name,
              ...body.description === undefined ? {} : { description: body.description },
            }]
          await scope.update({ addedModels: nextModels })
          if (!exists) await ctx.agentDefaultModel.saveSelection({ provider: body.provider, model: body.model })
          const sel = ctx.agentDefaultModel.currentSelection()
          const nextActive = exists ? { provider: sel.provider, model: sel.model } : { provider: body.provider, model: body.model }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, addedModels: nextModels, activeModel: nextActive }))
          return
        }
        if (req.method === 'DELETE') {
          const body = JSON.parse(await readBody(req)) as { provider?: string; model?: string }
          if (typeof body.provider !== 'string' || typeof body.model !== 'string') {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'Missing provider or model' }))
            return
          }
          const current = addedModelsSource
          const nextModels = current.addedModels.filter(m => !(m.provider === body.provider && m.model === body.model))
          const sel = ctx.agentDefaultModel.currentSelection()
          const wasActive = sel.provider === body.provider && sel.model === body.model
          await scope.update({ addedModels: nextModels })
          if (wasActive) await ctx.agentDefaultModel.saveSelection({ provider: '', model: '' })
          const nextActive = wasActive ? undefined : { provider: sel.provider, model: sel.model }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: true, addedModels: nextModels, activeModel: nextActive }))
          return
        }
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`english-learning: added models error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'english-learning: added models endpoint')

  /** Read the active model selection from agent-default-model. */
  function getActiveModel(): { provider: string; model: string } | undefined {
    const sel = ctx.agentDefaultModel.currentSelection()
    return (sel.provider && sel.model) ? { provider: sel.provider, model: sel.model } : undefined
  }

  /** Serve a static file from the dist directory. */
  async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
    // Block path traversal
    if (pathname.includes('..')) {
      res.writeHead(403)
      res.end()
      return
    }

    // Root serves index.html
    const file = pathname === '/' || pathname === '' ? distIndex : join(distRoot, pathname)

    try {
      const data = await readFile(file)
      const ext = '.' + (file.split('.').pop() ?? '')
      const mime = MIME[ext] ?? 'application/octet-stream'
      res.writeHead(200, { 'content-type': mime })
      res.end(data)
    } catch {
      // SPA fallback: serve index.html for any non-file path
      if (!pathname.includes('.')) {
        const data = await readFile(distIndex)
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        res.end(data)
      } else {
        res.writeHead(404)
        res.end()
      }
    }
  }

  // Subscribe to session events and forward to SSE clients
  ctx.on('session/event', (session, event) => {
    if (chatAgent === undefined) return
    if (String(session.id) !== chatAgent.sessionId) return
    switch (event.type) {
      case 'assistant/chunk': {
        const chunk = event.data.chunk
        if (chunk.type === 'text-delta') {
          broadcast('chunk', { text: chunk.text })
        }
        break
      }
      case 'assistant/message': {
        const content = event.data.message.content
        const text = content
          .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
          .map(b => b.text)
          .join('')
        if (text !== '') {
          broadcast('message', { text })
        }
        break
      }
      case 'turn/end': {
        broadcast('done', {})
        break
      }
      default:
        break
    }
  })

  // Forward agent status to SSE clients
  ctx.on('agent/status', ({ agent, status }) => {
    if (chatAgent === undefined) return
    const agentId = (agent as { id: string }).id
    if (agentId !== chatAgent.agentId) return
    broadcast('status', { status })
  })

  // Forward agent errors to SSE clients and console
  ctx.on('agent/error', ({ agent, error }) => {
    if (chatAgent === undefined) return
    const agentId = (agent as { id: string }).id
    if (agentId !== chatAgent.agentId) return
    const reason = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error(`english-learning: agent error: ${reason}`)
    if (stack !== undefined) console.error(stack)
    broadcast('error', { error: reason })
  })

  // SSE endpoint for streaming events to the browser
  const webServerForSse = ctx.webServer
  ctx.effect(() => webServerForSse.register({
    kind: 'exact',
    path: '/api/events',
    handler: (req, res) => {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        'connection': 'keep-alive',
      })
      res.write(':ok\n\n')
      sseClients.add(res)
      req.on('close', () => { sseClients.delete(res) })
    },
  }), 'english-learning: SSE endpoint')

  // Chat endpoint: receives a user message and forwards to the agent
  const webServerForChat = ctx.webServer
  ctx.effect(() => webServerForChat.register({
    kind: 'exact',
    path: '/api/chat',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      try {
        const body = JSON.parse(await readBody(req)) as { message?: string }
        const text = body.message
        if (typeof text !== 'string' || text.trim() === '') {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'Missing message' }))
          return
        }

        // Create agent on first message
        if (chatAgent === undefined) {
          // Read model from agent-default-model settings
          const activeModel = getActiveModel()
          if (activeModel === undefined) {
            res.writeHead(400, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'No model selected. Please add and select a model in Settings.' }))
            return
          }
          console.log(`english-learning: using model ${activeModel.provider}/${activeModel.model}`)
          const sessionId = SessionId(`english-learning-chat-${Date.now()}`)
          const handle = await ctx.agents.create({
            sessionId,
            meta: { cwd: process.cwd() },
            agentOptions: {
              provider: activeModel.provider,
              model: activeModel.model,
            },
          })
          chatAgent = {
            sessionId: String(sessionId),
            agentId: handle.agent.id,
            followup: (msg) => { handle.agent.followup(msg) },
            dispose: () => handle.dispose(),
          }
        }

        const message = createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'user' },
        })
        chatAgent.followup(message)

        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`english-learning: chat error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'english-learning: chat endpoint')

  // Available models endpoint: returns all models from all registered adapters
  const webServerForAvailable = ctx.webServer
  ctx.effect(() => webServerForAvailable.register({
    kind: 'exact',
    path: '/api/models/available',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      try {
        const entries = ctx.llm.listConfigurableProviders()
        const results: Array<{
          provider: string
          displayName: string
          models: Array<{ id: string; name: string; description?: string }>
        }> = []
        for (const entry of entries) {
          try {
            const models = await ctx.llm.listModels(entry.provider)
            if (models.length > 0) {
              results.push({
                provider: entry.provider,
                displayName: entry.displayName,
                models: models.map((m: { id: string; name: string; description?: string }) => ({
                  id: m.id,
                  name: m.name,
                  ...m.description === undefined ? {} : { description: m.description },
                })),
              })
            }
          } catch {
            // Skip providers that fail to list models
          }
        }
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ providers: results }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`english-learning: available models error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'english-learning: available models endpoint')

  // Providers endpoint: lists all configurable LLM providers
  const webServerForProviders = ctx.webServer
  ctx.effect(() => webServerForProviders.register({
    kind: 'exact',
    path: '/api/models/providers',
    handler: (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      try {
        const entries = ctx.llm.listConfigurableProviders()
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ providers: entries }))
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`english-learning: providers error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'english-learning: providers endpoint')

  // Model discovery endpoint: interrogates a provider for available models
  const webServerForDiscover = ctx.webServer
  ctx.effect(() => webServerForDiscover.register({
    kind: 'exact',
    path: '/api/models/discover',
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: 'Method not allowed' }))
        return
      }
      try {
        const body = JSON.parse(await readBody(req)) as { provider?: string; baseURL?: string; api?: string; apiKey?: string }
        const request: { provider?: string; baseURL?: string; api?: string; apiKey?: string } = {}
        if (typeof body.provider === 'string' && body.provider.length > 0) request.provider = body.provider
        if (typeof body.baseURL === 'string' && body.baseURL.length > 0) request.baseURL = body.baseURL
        if (typeof body.api === 'string' && body.api.length > 0) request.api = body.api
        if (typeof body.apiKey === 'string' && body.apiKey.length > 0) request.apiKey = body.apiKey

        const llmEntries = ctx.llm.listConfigurableProviders()

        // Helper: discover models for one provider
        type DiscoveredModelEntry = { id: string; name?: string; description?: string; contextWindow?: number; maxTokens?: number }
        const discoverOne = async (providerId: string): Promise<DiscoveredModelEntry[]> => {
          const entry = llmEntries.find(e => e.provider === providerId)
          if (entry?.settingsNs !== undefined) {
            try {
              return await ctx.llm.discoverModels(entry.settingsNs, { ...request, provider: providerId })
            } catch {
              // Discovery not registered; fall back to listModels
            }
          }
          try {
            const listed = await ctx.llm.listModels(providerId)
            return listed.map(m => ({
              id: m.id,
              name: m.name,
              ...m.description === undefined ? {} : { description: m.description },
            }))
          } catch {
            return []
          }
        }

        if (request.provider !== undefined) {
          // Single provider discovery
          const models = await discoverOne(request.provider)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ providers: [{ provider: request.provider, models }] }))
        } else {
          // Discover from ALL providers
          type ProviderResult = { provider: string; displayName: string; models: DiscoveredModelEntry[] }
          const results: ProviderResult[] = []
          for (const entry of llmEntries) {
            const models = await discoverOne(entry.provider)
            if (models.length > 0) {
              results.push({ provider: entry.provider, displayName: entry.displayName, models })
            }
          }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ providers: results }))
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`english-learning: model discovery error: ${reason}`)
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: reason }))
      }
    },
  }), 'english-learning: model discovery endpoint')

  // Claim the webserver fallback seat to serve the React app dist
  console.log('[english-learning] registering fallback handler')
  const webServerForFallback = ctx.webServer
  ctx.effect(() => webServerForFallback.registerFallback(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://x').pathname
    await serveStatic(pathname, res)
  }), 'english-learning: fallback seat')

  // After the Loader settles, print the URL and open the browser
  let announced = false
  ctx.inject(['webServer'], (wsCtx) => {
    const announce = (): void => {
      if (announced) return
      announced = true
      const ws = wsCtx.webServer as { port: number }
      const port = ws.port
      const webUrl = `http://127.0.0.1:${String(port)}`
      console.log(`dsh english-learning: ${webUrl}`)
      console.log('dsh english-learning: opening the default browser; pass --no-open to disable')
      void openBrowser(webUrl).catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error)
        console.error(`english-learning: could not open the default browser because ${reason}; open ${webUrl} manually`)
      })
    }
    const settled = (wsCtx.get('loader') as { await?: () => Promise<void> } | undefined)?.await?.()
    if (settled === undefined) announce()
    else {
      void settled.then(() => {
        if (wsCtx.get('webServer') !== undefined) announce()
      }, () => {})
    }
  })
}
