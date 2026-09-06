# Agent Note: Desktop shell Windows packaging through the packed-install sidecar

Status: implemented

English | [中文](2026-09-06-english-learning-desktop-windows-packaging.zh.md)

## Problem

The desktop shell's packaged mode required an env-named single-file sidecar that nothing produced for the English-learning profile, and the profile's runtime payload — the dashboard dist, the preset skills, the native addons — exists in no packaged artifact. Producing a Windows executable was therefore impossible, and the packaging route had to keep one property the profile depends on: bundles must resolve like a normal installation, because the profile template names `@deepseek-ai/dsh-base` and the loader imports plugin packages by bare name at runtime.

## Decision

**The sidecar is a real Node binary plus an npm-installed closure tree built from the release tarballs, and electron-builder cross-builds the Windows targets from macOS.**

- `scripts/package-desktop-sidecar.ts` stages a consumer that installs every `release:pack` tarball as a `file:` dependency — the exact layout `verify-packed-install` proves — then grafts the Windows-only pieces a host-side install cannot provide: `@koromix/koffi-win32-x64` (os-gated, so the platform package is force-installed explicitly) and `node.exe` (mirror-first download, cache-backed). node-pty's Windows ConPTY prebuilds and the vendored landlock optionals ship inside their own packages and need nothing.
- `apps/desktop` gains an electron-builder configuration (NSIS one-click + portable, x64) that copies the assembled sidecar through `extraResources`; the packaged shell resolves `resources/sidecar/node.exe` against `node_modules/@deepseek-ai/dsh/lib/bin.js`, with `DSH_DESKTOP_SIDECAR` still overriding toward a SEA-style single binary.
- `desktop-closure` exists as a workspace member to keep the dependency facts documented, but the npm tarball route replaced it as the staging mechanism: the `pnpm deploy --legacy` alternative re-enters the workspace from its target and its internal install attempts a root modules purge that cannot be answered safely without a TTY.

## Alternatives considered

**The pkg SEA route of `build-exe-for-python-sdk.ts`.** Rejected for now: its whole-tree asset closure is tuned to the Python deploy root, which names neither the English-learning bundles nor their dashboard dist; retuning it means a second closure and fresh static-analysis gaps for the loader's runtime imports.

**`pnpm deploy` staging.** Implemented first and abandoned: deploy's internal `pnpm install` re-enters the workspace, resolves the repository root as its project, and attempts a node_modules purge whose target is ambiguous at best and destructive at worst.

**Signing.** Deferred: no certificate is configured, so the Windows artifacts are unsigned and SmartScreen will warn; the build emits them unsigned rather than blocking.

## Consequences

Windows packaging is two commands (`sidecar:win`, `dist:win`) once `pnpm run build` and `release:pack` outputs exist, and the same flow produces a macOS verification carrier. The installer payload is large (hundreds of megabytes) because the closure ships the whole family tree; pruning is future work. The Windows executables have not been executed locally — the packaged layout they contain is verified live on macOS (backend spawn, OS-assigned port announce, window connection), and runtime proof on Windows lands with a real machine or a CI Windows smoke.

## Testing

`electron-builder --mac dir` produced an app that was launched live: the packaged branch spawned the sidecar node against the CLI entry, the backend announced on an OS-assigned port, and the window held an established connection. The Windows artifacts were inspected for a complete payload (CLI entry, dashboard dist, preset skills, koffi win32, node-pty win32 prebuilds, node.exe). Focused typecheck and oxlint are clean on every touched file.
