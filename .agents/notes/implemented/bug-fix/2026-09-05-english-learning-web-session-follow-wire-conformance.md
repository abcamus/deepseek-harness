# Agent Note: English-learning web Session follow wire conformance

Status: implemented

English | [中文](2026-09-05-english-learning-web-session-follow-wire-conformance.zh.md)

## Problem

Clicking any session in the english-learning web trajectory panel always failed with `Stream session/follow failed: typert gateway: session/follow: wire field "request" failed boundary validation`, and the panel hook re-followed every 3 seconds. `session/list` succeeded, so the panel showed Connected with the session list while every follow was rejected at the gateway.

Two stacked causes: the served `dist/` bundle predated the source fix that adds the required `kind: 'session'` address discriminator, and the bare `lib/` pattern in the root `.gitignore` ignored `apps/english-learning-web/src/lib/` entirely, so the inlined gateway client sources were untracked and the source-versus-bundle divergence was invisible to git. After a rebuild, follows opened but every trajectory rendered `0 turns · 0 events`: the follow opening snapshot carries history records wrapped as `{ type: 'event' | 'chunks', event }`, and the inlined client handed them to the trajectory builder as bare events.

## Decision

`apps/english-learning-web/src/lib/dsh-client.ts` conforms to the canonical Session wire contract owned by [Session history, control state, and Remote event transport](../architecture/2026-08-18-session-history-and-event-transport.md): `session/follow` and `session/page` addresses carry the `kind: 'session'` discriminator, follow opening snapshots and `session/page` results unwrap `SessionHistoryRecord.event` before events reach the trajectory builder, and `session/page` sends the descriptor-mandatory `throughSeq` cut. The root `.gitignore` negates `apps/english-learning-web/src/lib/` so client sources are tracked next to the components that consume them.

The webserver serves `dist/` from disk on every request, so deploying a client change is `vite build` plus a browser reload, with no server restart. The 3-second follow retry loop is unchanged; a successful follow ends it.

## Alternatives considered

**Rebuild only.** Deploying the already-fixed discriminator without unwrapping records lost: follows then opened, but every trajectory stayed empty — the same user-facing failure one step later.

**Normalize records server-side for this app.** Lost: the wrapped record envelope is the canonical wire contract consumed by the official clients; a per-app variant would fork the contract the transport note above owns.

**Import the canonical gateway client instead of the inlined copy.** Deferred: replacing the inlined WebSocket client with `@deepseek-ai/dsh-client-web` is a larger bundle refactor; this change restores conformance without it.

## Consequences

Trajectory following renders turns from the opening snapshot for the listed sessions, and follow failures from wire-shape drift are pushed to rebuild time instead of runtime. The packed `chunkrow/*` runs inside a snapshot are still not rendered: assistant text shows `(empty response)` and packed tool calls show `unknown` names when the payload lives only in a packed run. Consuming packed runs in the trajectory builder is the remaining fidelity gap. Changes under `src/lib/` now require a rebuild to reach the served app, and git tracks those sources so the requirement is visible.
