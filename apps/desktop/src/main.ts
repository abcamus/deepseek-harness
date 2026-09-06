/**
 * Desktop shell for the DSH English-learning profile.
 *
 * The shell owns no product logic: it spawns the `dsh --profile english-learning`
 * backend (the only supported way to launch the application), points every state
 * root at the OS application-data directory, waits for the backend to announce
 * its loopback URL, and shows that URL in a window. The SPA requires a live
 * same-origin HTTP server (its WebSocket client degrades under file://), so the
 * window loads the backend URL instead of local files.
 */

import { app, BrowserWindow, dialog } from 'electron'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

/** The profile the shell launches; the shell has no other surface. */
const PROFILE = 'english-learning'

/** Inner backend args shared by both sidecar forms; the shell itself opens the URL. */
const BACKEND_ARGS = ['--profile', PROFILE, '--no-open', '--port', '0'] as const

/**
 * The backend announces its loopback URL (with the launch token) on stdout,
 * e.g. `http://127.0.0.1:4000/?token=<base64url>`.
 */
const READY_URL_PATTERN = /http:\/\/(?:127\.0\.0\.1|localhost):\d+\/\?token=[A-Za-z0-9_-]+/

/** How long to wait for the backend's ready URL before giving up. The first
 * source-launch boot compiles the whole tree, so only a packaged sidecar needs
 * less; the SEA binary announces within seconds. */
const READY_TIMEOUT_MS = 600_000

/** Environment variable holding a packaged sidecar executable path. */
const SIDECAR_ENV = 'DSH_DESKTOP_SIDECAR'

/** The backend entry inside the packaged sidecar runtime tree. */
const SIDECAR_ENTRY = 'runtime/node_modules/@deepseek-ai/dsh/lib/bin.js'

let child: ReturnType<typeof spawn> | undefined
let mainWindow: BrowserWindow | undefined
let quitting = false

/**
 * Resolve the command launching the backend. A packaged shell runs the
 * sidecar runtime staged under the app resources — a real Node binary plus the
 * npm-installed harness tree, so profile bundle resolution and native addons
 * match a normal installation. `DSH_DESKTOP_SIDECAR` overrides this with a
 * single SEA-style executable. An unpacked shell runs the repository CLI
 * through pnpm (`pnpm run dsh` = `node --import tsx/esm apps/cli/src/bin.ts`).
 * @returns The executable and its argument list.
 */
function resolveSidecar(): { command: string; args: string[] } {
  const sidecar = process.env[SIDECAR_ENV]
  if (sidecar !== undefined && sidecar !== '') return { command: sidecar, args: [...BACKEND_ARGS] }
  if (app.isPackaged) {
    const sidecarDir = join(process.resourcesPath, 'sidecar')
    const nodeBinary = join(sidecarDir, process.platform === 'win32' ? 'node.exe' : 'node')
    return { command: nodeBinary, args: [join(sidecarDir, SIDECAR_ENTRY), ...BACKEND_ARGS] }
  }
  // lib/main.js → apps/desktop/lib → apps/desktop → apps → repository root.
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: ['--dir', repoRoot, 'run', 'dsh', ...BACKEND_ARGS],
  }
}

/**
 * Environment and working directory for the backend: DSH_HOME relocates every
 * home-anchored state root (sessions, storages, settings, profiles), and the
 * cwd hosts the workspace-relative `.english-learning/` data directory, whose
 * path the plugin currently hardcodes to `process.cwd()`.
 * @returns The child process options.
 */
function sidecarOptions(): { env: NodeJS.ProcessEnv; cwd: string } {
  const userData = app.getPath('userData')
  const dshHome = join(userData, 'dsh-home')
  const workspace = join(userData, 'workspace')
  mkdirSync(dshHome, { recursive: true })
  mkdirSync(workspace, { recursive: true })
  return {
    env: { ...process.env, DSH_HOME: dshHome, DSH_TELEMETRY_DISABLED: '1' },
    cwd: workspace,
  }
}

/**
 * Spawn the backend and resolve with its announced ready URL. Stderr and
 * non-matching stdout pass through to this process's console for diagnostics.
 * @returns The ready URL, or undefined when the backend exited first.
 */
function waitForReadyUrl(): Promise<string | undefined> {
  const { command, args } = resolveSidecar()
  const { env, cwd } = sidecarOptions()
  const spawned = spawn(command, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] })
  child = spawned
  return new Promise((resolvePromise) => {
    let buffered = ''
    const onChunk = (chunk: Buffer): void => {
      const text = chunk.toString()
      process.stdout.write(text)
      buffered += text
      if (buffered.length > 64 * 1024) buffered = buffered.slice(-16 * 1024)
      const match = READY_URL_PATTERN.exec(buffered)
      if (match !== null) resolvePromise(match[0])
    }
    const stdout = spawned.stdout
    const stderr = spawned.stderr
    stdout.on('data', onChunk)
    stderr.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk)
    })
    spawned.once('exit', (code, signal) => {
      process.stderr.write(`dsh backend exited (code=${String(code)} signal=${String(signal)})\n`)
      resolvePromise(undefined)
    })
  })
}

/** Create and show the main window for a ready backend URL. */
function showWindow(readyUrl: string): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
  })
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })
  // The window's browser session keeps the launch-token cookie, so reloads
  // and in-app navigation need no token again.
  void mainWindow.loadURL(readyUrl)
  mainWindow.on('closed', () => {
    mainWindow = undefined
  })
}

/** Report a fatal shell problem and quit; never silently lose the backend. */
async function failAndQuit(message: string): Promise<void> {
  await dialog.showMessageBox({ type: 'error', title: 'DeepSeek Harness', message })
  app.quit()
}

/** Terminate the backend; Windows has no SIGTERM, so kill() terminates it. */
function stopBackend(): void {
  quitting = true
  if (child?.pid !== undefined && child.exitCode === null) child.kill()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow !== undefined) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(() => {
    void (async () => {
      let readyUrl: string | undefined
      try {
        readyUrl = await Promise.race([
          waitForReadyUrl(),
          new Promise<undefined>((resolvePromise) => {
            setTimeout(() => {
              resolvePromise(undefined)
            }, READY_TIMEOUT_MS)
          }),
        ])
      } catch (error) {
        await failAndQuit(`无法启动 dsh 后端:${String(error)}`)
        return
      }
      if (readyUrl === undefined) {
        await failAndQuit('dsh 后端在就绪前退出,详见控制台输出。')
        return
      }
      showWindow(readyUrl)
      // The backend is a single long-lived process: if it dies, the UI has
      // nothing to talk to, so report and quit (auto-restart is future work).
      child?.once('exit', () => {
        if (!quitting) void failAndQuit('dsh 后端已退出,应用即将关闭。')
      })
    })()
  })

  app.on('window-all-closed', () => {
    // Closing the window ends the session; the backend has no other UI, so the
    // shell quits on every platform rather than idling in a tray.
    app.quit()
  })
  app.on('before-quit', () => {
    stopBackend()
  })
  app.on('quit', () => {
    stopBackend()
  })
}
