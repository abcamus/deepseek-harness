# Agent Note: English-learning speaking practice page

Status: implemented

English | [中文](2026-09-06-english-learning-speaking-practice.zh.md)

## Problem

The exercise-generator skill's speaking dimension lived entirely in chat: the template printed repeat-after sentences and a dialogue skeleton as plain text, "speaking" meant typing answers back, and nothing in the app could record a voice or score pronunciation. After the listening page shipped, the gap was stark — one ability had a real practice surface and the other was still a text template.

## Decision

**Speaking practice mirrors the listening pipeline end to end: the skill writes a `speaking-exercise` document, the bundle classifies the write and broadcasts it over SSE, and the `/speaking` page records, transcribes, and scores every line client-side.**

- **The document is a line list with roles.** A request marked 「来自口语练习页」 triggers the skill's page-driven branch: 5–8 readable English lines — plain repeat-after sentences, or an A/B dialogue where `role: "A"` lines are the partner's given lines and `role: "B"` lines are the learner's — written to `.english-learning/speaking-session.json`. The chat receives only a confirmation line (exercise-generator/SKILL.md).
- **Recording and recognition are client-side.** The page plays model lines through the shared Edge TTS endpoint, records the learner with `MediaRecorder`, and transcribes with the browser's speech recognition (en-US). Each transcript is scored against its target line with word-level edit distance (`similarityScore`, ≥60 passes), the learner can replay their own recording per line, and self-assessment covers browsers without the recognition API or when the microphone is denied.
- **The outcome lands as a standard record.** Submitting POSTs `{count, correct}` to `/api/speaking/result`, which composes the same `{kind: 'exercise', skill: 'speaking'}` progress record the skill writes for chat-graded rounds and retires the session document; `GET /api/speaking` restores a reloaded round. 请 AI 点评 hands the target/transcript/score triples to the chat for pronunciation feedback.
- **One TTS endpoint, two pages.** The listening player's synthesis endpoint was generalized from `/api/listening/audio` to `/api/tts` so both practice pages share the Edge voices and the disk cache.

## Alternatives considered

**Grading free-form dialogue answers with the LLM.** Lost for v1: open spoken answers have no client-verifiable answer key, so every line would need an LLM round trip; the page instead scores repeat-after fidelity deterministically and routes expression feedback through the existing chat.

**Uploading recordings for server-side scoring.** Lost: audio storage and server-side recognition add moving parts a single-learner local app does not need; the transcript plus the learner's own playback carry the same information.

**Typed answers.** Lost: they reduce speaking practice back to the chat template the page replaces.

## Consequences

Recognition quality depends on the browser: the API is Chromium-only and microphone permission is required, so the page offers a self-assessment path when either is missing, and a failed synthesis never blocks a round — model lines fall back to browser speech. Recordings never leave the machine; the transcript sent to the chat for critique is the only artifact. A running instance older than the speaking endpoints serves the new page from disk but fails submission with a not-recorded hint until restarted, because the static dist is read per request while plugin code loads at boot.

## Testing

`speaking.ts` is unit-tested in `packages/bundle/english-learning/tests/speaking.spec.ts` beside the listening and placement specs: tolerant-parse matrices (roles, notes, optional fields), path matching including look-alike directories, and write classification including the listening-session look-alike. Recording, recognition, and scoring are exercised through the page by hand against the real service.
