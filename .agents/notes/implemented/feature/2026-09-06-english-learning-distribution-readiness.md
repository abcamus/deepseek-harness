# Agent Note: English-learning distribution readiness

Status: implemented

English | [中文](2026-09-06-english-learning-distribution-readiness.zh.md)

## Problem

The english-learning app could not reach an out-of-repo user, for three stacked reasons. The shipped profile template initialized a fresh `~/.dsh/profiles/english-learning` with only `@deepseek-ai/dsh-english-learning` — no `@deepseek-ai/dsh-base` — so a new installation mounted a bundle whose eight injected services (tools, skills, web, webServer, agents, llm, settings, agentDefaultModel) were never provided; the app worked in-repo only because the developer's hand-created profile predated the template. The web dashboard package was `private: true` while sitting in the dsh release family (`apps/*/package.json`), so the release either failed at its publish step or shipped a bundle whose hard dependency could not resolve. And the bundle's manifest exported `./src/*` while its `files` list never shipped `src`, promising files a published tarball cannot carry.

## Decision

**The english-learning profile joins the standard npm distribution: fix the profile template, make every family member publishable, and lean on the existing release pipeline (pack on every PR, publish from a `dsh-v*` tag, `verify-packed-install` driving the installed binary) — end users install one CLI and run one profile.**

- **The profile template now names the base bundle** — `['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-english-learning']`, matching every other base-backed template (acp, web, headless, sdk) — and the installation-owned tuple list records the pre-template layout so existing profile directories normalize instead of drifting.
- **The web dashboard is a publishable family member.** Dropping `private: true` (with `publishConfig.access: public`) lets the pack and publish steps treat it like any member; its `files: ["dist", …]` ships the prebuilt assets the bundle serves. The official build now constructs it too: `build:web` runs both web frontends and the client-build record's artifact patterns include `apps/english-learning-web/dist/**/*`, so the freshness digest binds the shipped dist to the build environment instead of trusting a gitignored directory.
- **Manifest hygiene aligns the family.** The bundle dropped the phantom `./src/*` export, and the three members that had drifted off the shared version line (the english-learning bundle at 0.1.0, the web package at 0.1.0-alpha.1, web-fetch-xiaohongshu and the hello bundle at 0.1.0) moved to the family version — the exact normalization `release:dsh` performs, applied by hand so `release:verify` passes before the next bump.
- **`--no-open` is honored.** The announce block reads the `webStartup` service's `openBrowser` flag and prints the URL without shelling out to a browser opener, which headless and server users need.

## Alternatives considered

**Fixing the bundle's patch to insert the base rows itself.** Lost: the base rows are the host's shared core with platform gating and per-row rationale owned by `dsh-base`; duplicating them would fork the core composition and drift on every base change.

**Inlining the web dist into the bundle package's own `files`.** Lost: it would couple the bundle's publish to a build step in a sibling directory and double the assets on disk; the harness convention is one package per dist, resolved through the dependency tree.

**A dedicated offline tarball flow.** Deferred: `release:pack` already produces the full tarball set and `verify-packed-install` proves it installs; npm publication through `release-publish.yml` is the maintained path this work targets, and the packed directory remains the fallback for sharing without registry access.

## Consequences

A fresh `npm i -g @deepseek-ai/dsh` + `dsh --profile english-learning` now boots the full stack: the profile initializes with base plus the bundle, the dashboard serves from the published web package's dist, the preset skills arrive through `dsh-agent-presets`, and learner data accrues under `./.english-learning/` in the launch directory. The release family is one version larger in publish scope — the web package's dist must be built by the official build before any pack, which the artifact-pattern digest now enforces rather than trusts. Existing in-repo profiles keep working: the developer's tuple matches the template, and normalizing it is now permitted rather than a drift.

## Testing

`release:verify --family dsh` passes on the aligned manifests (245 members, one version), and the verification chain runs `build:official` → `release:pack` → `release:verify-packed-install` against the packed set; the packed install is then booted as the english-learning profile to prove the template fix. `verify-package-readme-limitations` and `verify-package-readme-model-experience` pass for this package's new bilingual README.
