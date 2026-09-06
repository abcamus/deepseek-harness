# Agent Note: Dashboard model settings materialize the pi-ai route and credential

Status: implemented

English | [中文](2026-09-06-english-learning-model-route-materialization.zh.md)

## Problem

The dashboard's model settings page wrote only its own display list and the active-model pick. The pi-ai LLM adapter mounts dormant and registers adapters exclusively for routes named in its `llm-pi-ai.providers.*` settings section, and the referenced credential lives in the credentials seam — so in a fresh harness home (the desktop shell's private `DSH_HOME`, or any new installation) a user could add and activate a model and then every chat round failed with `no adapter registered for provider …`. The page offered no key input and no way to close the gap.

## Decision

**Adding or activating a model now also materializes its route and stores its key, so the settings flow is complete on its own.**

- `POST /api/models/added` accepts an optional `apiKey`, and a new `POST /api/models/key` stores a provider's key without touching the model list; activating a model (`POST /api/settings/model`) also ensures its route exists, so selections made before this fix recover on the next activation.
- One helper, `ensurePiAiRoute`, derives the conventional reference (`OPENCODE_API_KEY`-style, the same derivation the core Models page uses), reads the stored `llm-pi-ai` section, and writes minimal path ops: an absent profile is created `{}` — naming `apiKeyEnv` only when a key accompanies the call; a present profile that names no reference gains `apiKeyEnv` only then; a profile that names its own reference is left untouched and receives the key under that reference. The op computation is a pure export (`piAiRouteOps`) so the merge discipline is unit-testable without a boot.
- The provider card grew a key field with its own save action, and both add and save carry the typed draft so one action can complete configuration. A failed write surfaces the server's reason (including pi-ai's refusal of an unserviceable route) inline.

## Alternatives considered

**Rewriting the whole `llm-pi-ai` section on save.** Lost: it would clobber user-customized profiles (custom user agent, narrowed model catalogs) written through the core Models page; minimal path ops extend instead of replace.

**Pointing the dashboard at the core Models page.** Lost: the dashboard owns its flow, and the same-process settings and credentials seams already provide everything the page needs.

**Leaving configuration to `settings.yaml` hand edits.** Rejected: the desktop shell ships a private harness home precisely so users never edit files under Application Support.

## Consequences

A fresh home reaches a working chat through the dashboard alone: pick a provider, paste the key, add a model. Existing homes gain their routes on the next activation or key save; hand-written profiles keep their shape because writes are field-scoped. The route write is fail-loud where pi-ai refuses a route, so a typo'd provider id surfaces with the adapter's own reason.

## Testing

Focused `tsc -b tsconfig.host.json` passes; the route-ops merge behavior is covered by direct assertions and a unit spec (`tests/model-route.spec.ts`); oxlint is clean on every touched file; the dashboard builds. End-to-end, a key stored through the running app registered the adapter live (settings hot-reload) and a chat round succeeded on the previously failing provider.
