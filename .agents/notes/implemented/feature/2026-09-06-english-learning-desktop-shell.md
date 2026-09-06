# Agent Note: English-learning desktop shell and landed distribution fixes

Status: implemented

English | [中文](2026-09-06-english-learning-desktop-shell.zh.md)

## Problem

Work on a desktop app surfaced that the [distribution readiness](2026-09-06-english-learning-distribution-readiness.md) note recorded decisions whose code never landed: the profile template still initialized `english-learning` without `@deepseek-ai/dsh-base` (the installation-owned tuple list had no entry either), the web dashboard stayed `private: true` at a version off the family line, `build:web` skipped the dashboard and the client-build record's artifact patterns never bound its dist, two family members sat at `0.1.0`, and `verify-packed-install` installed with `--omit=optional`, which since koffi 3.2 strips the platform package carrying koffi's prebuilt binary and forces a source build that fails to link. A fresh install could not boot the profile, and there was no desktop surface at all.

## Decision

**Land the deferred distribution code, then add an Electron shell that spawns the dsh profile and shows its dashboard — the shell owns no product logic and the SPA is unchanged.**

- The profile template names `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-english-learning']` and the retired single-bundle tuple normalizes existing profile directories; the web package is publishable at the family version; `build:web` builds both frontends and the artifact digest includes the dashboard dist; `verify-packed-install` keeps optional dependencies (npm skips an optional that fails, so the Landlock packages stay harmless, while koffi ≥3.2 requires its own platform optionals).
- `apps/desktop` runs the backend as a child process (`pnpm run dsh --profile english-learning --no-open --port 0`, or the SEA binary named by `DSH_DESKTOP_SIDECAR`), points `DSH_HOME` and the backend cwd into the OS application-data directory, parses the announced `http://127.0.0.1:<port>/?token=…` line from stdout, and loads it in a `BrowserWindow`. Port 0 removes the fixed-port collision class; `--no-open` keeps the browser closed; single-instance lock, ready-timeout error dialog, and SIGTERM teardown are in; tray, auto-restart, and auto-update are deferred.
- Packaging (electron-builder + SEA sidecar reuse) stays future work: it needs signing and update-channel decisions first.

## Alternatives considered

**Embedding the harness in the Electron main process.** Rejected: Electron's bundled Node sits below the harness engines floor and node-pty would need a rebuild per Electron ABI.

**Tauri with the SEA sidecar.** Viable later for a smaller install, but it adds a Rust toolchain for no functional gain today.

**Port 0 through a home-level `cordis.patch.yml`.** Unnecessary: the webStartup service already owns `--port` and `--no-open`.

## Consequences

A fresh packed install boots the english-learning profile end to end, and the desktop shell runs the app from the repository in dev mode today; a packaged shell only needs the sidecar path. The verify script now exercises the dependency shape a real consumer sees. On a cold machine the first source-launch boot spends minutes compiling, so the shell's ready timeout is ten minutes — the packaged sidecar announces within seconds.

## Testing

`build:official` → `release:pack` (245 dsh + 9 vendor tarballs) → `verify-packed-install` (254 tarballs; the installed CLI reports the family version) → a boot smoke of the packed install reaching the announce URL; a live desktop-shell run showed the OS-assigned-port announce, honored `--no-open`, an established window connection, and clean SIGTERM teardown; focused oxlint is clean. The app-boot unit tests were skipped for the known standalone-run OOM.
