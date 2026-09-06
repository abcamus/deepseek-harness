# Agent Note: English-learning placement visualization

Status: implemented

English | [中文](2026-09-05-english-learning-placement-visualization.zh.md)

## Problem

The placement assessment ran entirely inside the floating chat box. The skill's multi-round flow (background → reading → writing → speaking → scoring) reached the learner as plain text bubbles, the dashboard had no notion of assessment stages, and completion surfaced only when the 30-second `/api/profile` poll happened to notice the new profile. A learner mid-assessment saw no progress, no indication of which dimension was being assessed, and no result presentation beyond the agent's chat prose.

## Decision

**Stage progress is an agent-written file, projected to the dashboard as structured SSE events.** The placement-assessment skill rewrites `.english-learning/placement-progress.json` with the stock `write` tool at every stage transition — `{time, kind: 'placement-progress', stage, round, totalRounds}` with `stage` drawn from `background | reading | writing | speaking | scoring` — reusing the agent-writes-JSON pattern the profile already established. The `profile.json` contract and the completion signal (writing the profile) are unchanged.

- **The bundle classifies writes, not chat text.** `classifyPlacementWrite` (`src/placement.ts`) matches a `write` tool call's target path by final segments (`.english-learning/placement-progress.json` / `profile.json`, relative or absolute) and tolerantly parses the content. Broadcasts happen on `tool/result`, never `tool/call`, so an event only fires after the write landed: `placement {stage, round, totalRounds, time}` per progress write, `placementComplete {profile}` when a placement-sourced profile write lands while an assessment is active. A `manual`-source profile document never completes an assessment, so chat asks to hand-edit the profile cannot fake one. Completion also deletes the progress file.
- **`GET /api/placement` serves the progress document** (or null) so a freshly reloaded dashboard restores the in-flight assessment without waiting for the next write.
- **The dashboard's full-screen `/assessment` view** renders a five-stage stepper (背景了解 → 阅读理解 → 写作表达 → 口语表达 → 评估报告), per-dimension indicator chips, and the same embedded chat that drives the assessment — the message transcript and input row are extracted shared components (`ChatTranscript`, `ChatInput`) also used by the floating chat. On mount it restores progress via `GET /api/placement`; on completion it shows the result panel and returns to the dashboard. `startPlacement` navigates there, the floating chat hides on the route, and while a placement streams outside the view the chat shows an entry banner into it.
- **One result card, three surfaces.** `PlacementResult` renders the overall CEFR badge, per-dimension A1–C2 scale bars, weak-dimension badges, the summary, and the listening/speaking estimate footnote. It appears in the assessment view's result panel, in the chat transcript (the `placementComplete` event appends a result message to the message flow), and in the settings profile section, replacing the former plain-text per-skill line. A completion refetches profile and progress immediately instead of waiting for the poll.

## Alternatives considered

**A structured quiz protocol (agent emits question JSON, the dashboard renders a full-screen form).** Still lost: the assessment interaction stays chat-driven — only the progress and result presentation is structured. The chat keeps streaming, history, and per-round difficulty adaptation; the visualization adds no new interaction protocol.

**Parsing assistant text for stage markers or counting turns in the bundle.** Lost twice over: text markers pollute the learner-visible chat and break on wording drift, and turn counting cannot distinguish placement rounds from ordinary chat turns on the shared persistent agent. The progress file carries the stage identity explicitly.

**A radar chart for the result.** Lost: CEFR levels are ordinal, not numeric — four bars on a shared A1–C2 scale show the same facts without implying a measurable radius.

## Consequences

Stage fidelity depends on the model following the progress-write instruction: a skipped write freezes the stepper at the previous stage but cannot corrupt the assessment or the store, since the parsers reject malformed documents. An abandoned assessment leaves its progress file behind; consumers treat documents older than 15 minutes as inactive, and the next assessment overwrites the file at its first transition. Because `placementComplete` is broadcast on `tool/result`, the frontend's immediate profile refetch cannot race the write. The live entry banner and in-chat result card exist only on the SSE stream; a page reloaded mid-assessment recovers the stage through `GET /api/placement` but replays no result card.

## Testing

`placement.ts` is unit-tested in `packages/bundle/english-learning/tests/placement.spec.ts`: tolerant-parse matrices for both documents, path matching including look-alike directories, and write classification including the manual-source and malformed-content guards.
