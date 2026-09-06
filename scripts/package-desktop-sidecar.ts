/**
 * Assemble the desktop sidecar runtime that `apps/desktop` ships inside the
 * packaged app: a real Node binary plus an npm-installed harness tree whose
 * profile bundles resolve exactly like a normal installation (this is the
 * packed-install layout `verify-packed-install` proves and the English-learning
 * boot smoke drives end to end). electron-builder copies the assembled
 * directory through its `extraResources` config; the shell spawns the node
 * binary against the CLI entry (see `apps/desktop/src/main.ts`).
 *
 * Route: `release:pack` produces the release tarballs, the staged consumer
 * installs every tarball as a `file:` dependency (so no registry resolution is
 * involved for the family), and platform-specific grafts repair what a
 * host-side install cannot provide: Windows needs koffi's os-gated platform
 * package and a Windows node.exe.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { get } from 'node:https'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(import.meta.dirname, '..')
/** Packed release tarballs, dsh and vendor families (see `release:pack`). */
const PACKED_DIRS = [resolve(root, 'dist/npm'), resolve(root, 'dist/npm-vendor')]
/** Assembled sidecar, consumed by electron-builder's `extraResources`. */
const SIDECAR_DIR = resolve(root, 'apps/desktop/build/sidecar')
const RUNTIME_DIR = join(SIDECAR_DIR, 'runtime')
/** The CLI entry the sidecar node binary launches. */
const ENTRY = 'node_modules/@deepseek-ai/dsh/lib/bin.js'
/** Download cache for the Windows node binary, kept across runs. */
const NODE_CACHE = resolve(root, '.dsh-build/desktop-node-cache')
/** Mirror-first binaries host; the nodejs.org origin is the fallback. */
const NODE_BIN_MIRRORS: ReadonlyArray<(version: string) => string> = [
  version => `https://cdn.npmmirror.com/binaries/node/v${version}/win-x64/node.exe`,
  version => `https://nodejs.org/dist/v${version}/win-x64/node.exe`,
]

type Platform = 'mac' | 'win'

/**
 * Run one npm command inside a directory, inheriting stdio. CI mode keeps
 * lifecycle scripts non-interactive.
 * @param cwd - the directory npm operates on.
 * @param args - the npm arguments.
 */
function runNpm(cwd: string, args: string[]): void {
  const result = spawnSync('npm', args, { cwd, stdio: 'inherit', env: { ...process.env, CI: 'true' } })
  if (result.status !== 0) {
    throw new Error(`package-desktop: npm ${args.join(' ')} exited with ${String(result.status ?? result.signal)}`)
  }
}

/**
 * Every packed tarball under the pack output directories, as `file:` dependency
 * entries keyed by package name (the `verify-packed-install` recipe).
 * @returns the consumer manifest dependencies.
 */
function packedDependencies(): Record<string, string> {
  const dependencies: Record<string, string> = {}
  for (const directory of PACKED_DIRS) {
    for (const filename of readdirSync(directory).filter(name => name.endsWith('.tgz')).sort()) {
      const tarball = join(directory, filename)
      // The tarball filename mangles the scope, so read the real name from the
      // manifest inside; one entry per package, last wins on duplicates.
      const listing = spawnSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8' })
      if (listing.status !== 0) throw new Error(`package-desktop: cannot read ${tarball}`)
      const manifest = JSON.parse(listing.stdout) as { name: string }
      dependencies[manifest.name] = pathToFileURL(tarball).href
    }
  }
  return dependencies
}

/**
 * Download one URL to a file, following redirects.
 * @param url - the absolute HTTPS URL.
 * @param destination - the file to write.
 * @returns whether the download succeeded.
 */
function download(url: string, destination: string): Promise<boolean> {
  return new Promise((resolvePromise) => {
    get(url, (response: IncomingMessage) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const location = response.headers.location
        response.resume()
        if (location === undefined) { resolvePromise(false); return }
        resolvePromise(download(location, destination))
        return
      }
      if (response.statusCode !== 200) { response.resume(); resolvePromise(false); return }
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      response.on('error', () => { resolvePromise(false) })
      response.on('end', () => {
        writeFile(destination, Buffer.concat(chunks)).then(
          () => { resolvePromise(true) },
          () => { resolvePromise(false) },
        )
      })
    }).on('error', () => { resolvePromise(false) })
  })
}

/**
 * Fetch the Windows node.exe of the running Node version, preferring the
 * mirror; a cached copy from a previous run is reused.
 * @param destination - where the binary is written.
 */
async function fetchWindowsNode(destination: string): Promise<void> {
  const version = process.version.replace(/^v/, '')
  const cached = join(NODE_CACHE, `node-v${version}-win-x64.exe`)
  if (existsSync(cached) && statSync(cached).size > 1_000_000) {
    await copyFile(cached, destination)
    console.log(`package-desktop: node.exe from cache (${String(statSync(cached).size)} bytes)`)
    return
  }
  await mkdir(NODE_CACHE, { recursive: true })
  for (const mirror of NODE_BIN_MIRRORS) {
    const url = mirror(version)
    console.log(`package-desktop: downloading ${url}`)
    if (await download(url, cached)) {
      await copyFile(cached, destination)
      return
    }
  }
  throw new Error(`package-desktop: could not download node.exe v${version} from any mirror`)
}

/**
 * Materialize one platform's sidecar directory.
 * @param platform - the target platform the packaged app runs on.
 */
async function assemble(platform: Platform): Promise<void> {
  await rm(SIDECAR_DIR, { recursive: true, force: true })
  await mkdir(RUNTIME_DIR, { recursive: true })
  const dependencies = packedDependencies()
  await writeFile(
    join(RUNTIME_DIR, 'package.json'),
    `${JSON.stringify({
      name: 'dsh-desktop-sidecar-runtime',
      version: '0.0.0',
      private: true,
      dependencies,
    }, null, 2)}\n`,
  )
  runNpm(RUNTIME_DIR, ['install', '--no-audit', '--no-fund', '--package-lock=false'])
  const entry = join(RUNTIME_DIR, ENTRY)
  if (!existsSync(entry)) throw new Error(`package-desktop: staged runtime has no CLI entry at ${entry}`)
  if (platform === 'win') {
    // koffi resolves its Windows addon from an os-gated platform package that a
    // macOS install skips; force-install it so the tree carries both platforms.
    const koffiManifest = JSON.parse(await readFile(join(RUNTIME_DIR, 'node_modules/koffi/package.json'), 'utf8')) as
      { version: string; optionalDependencies?: Record<string, string> }
    const win32Package = Object.keys(koffiManifest.optionalDependencies ?? {})
      .find(name => name === '@koromix/koffi-win32-x64')
    if (win32Package === undefined) throw new Error('package-desktop: koffi publishes no win32-x64 platform package')
    runNpm(RUNTIME_DIR, ['install', '--no-save', '--force', '--no-audit', '--no-fund',
      `${win32Package}@${koffiManifest.version}`])
    await fetchWindowsNode(join(SIDECAR_DIR, 'node.exe'))
  } else {
    // The verification carrier: the running Node binary itself, which is
    // self-contained and satisfies the engines range by construction.
    await copyFile(process.execPath, join(SIDECAR_DIR, 'node'))
  }
  console.log(`package-desktop: sidecar assembled at ${SIDECAR_DIR}`)
}

const { values } = parseArgs({
  options: { platform: { type: 'string' } },
  allowPositionals: false,
})
const platform = values.platform
if (platform !== 'mac' && platform !== 'win') {
  console.error('Usage: tsx scripts/package-desktop-sidecar.ts --platform <mac|win>')
  process.exit(1)
}
void assemble(platform).then(
  () => { process.exit(0) },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  },
)
