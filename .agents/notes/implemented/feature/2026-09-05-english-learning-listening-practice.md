# Agent Note: English-learning listening practice page

Status: implemented

English | [中文](2026-09-05-english-learning-listening-practice.zh.md)

## Problem

The exercise-generator skill's listening dimension was chat-text reading comprehension: the template printed a passage plus multiple-choice questions as plain chat bubbles, the app had no audio anywhere, and grading required typing `1A, 2C` back into the chat. The dashboard's 完成听力练习 mission and the listening skill card had no practice surface to point at.

## Decision

**The listening exercise is an agent-written document rendered as an interactive player on a dedicated full-screen `/listening` page, graded client-side, and reported back through a REST endpoint that writes the standard progress record.**

- **The exercise document carries the answer key.** Starting a round on the page sends a fixed prompt marked 「来自听力练习页」， which triggers the exercise-generator skill's page-driven branch: it generates a level-appropriate English passage with 3–5 four-option questions and writes the whole exercise — passage, questions, `answer` index, one-line explanations — to `.english-learning/listening-session.json` with the stock `write` tool. The chat receives only a one-line confirmation, so the passage is heard before it can be read (exercise-generator/SKILL.md).
- **The bundle classifies writes, not chat text** — the placement pipeline pattern. `classifyListeningWrite` (`src/listening.ts`) matches the session path by final segments and tolerantly parses the content; the `listeningExercise` SSE event broadcasts on `tool/result`, never `tool/call`. `GET /api/listening` serves the pending document so a reloaded page restores the round.
- **Grading is client-side; the record is server-side.** The page plays the passage through the backend's Edge neural voices — `msedge-tts` proxying the Edge Read Aloud service at `POST /api/tts`, disk-cached under `.english-learning/tts-cache/`, with four pickable voices — and falls back to the browser's speech synthesis when synthesis fails. The fallback picks the best installed system voice instead of the platform default: English voices are ranked by quality signals (network "natural"/Google voices, Enhanced/Premium downloads, Siri) plus a gender match to the selected Edge voice, which keeps compact novelty voices ("Bahh", "Bells") out of a listening drill; the player shows a degraded-quality notice while the fallback is active. The player offers play/pause/resume, replay, and 0.75×/1×/1.25×. The page hides the transcript until submission, grades the selections against the answer key, and POSTs `{count, correct}` to `/api/listening/result`. The bundle composes the same `{kind: 'exercise', skill: 'listening', count, correct}` record the skill writes for chat-graded rounds, then deletes the session document, so the dashboard's XP/accuracy/streak aggregation is untouched. The page-driven branch never writes a progress record itself, so a round cannot be double-counted.
- **Entry points:** a 🎧 button in the top bar, and the dashboard's listening skill card navigates to `/listening` directly (other abilities keep the detail modal). The floating chat hides on the route. 讨论错题 hands the wrong questions to the chat as a self-contained message and returns to the dashboard.

## Alternatives considered

**Agent-graded rounds through the chat.** Lost: grading four-option MCQs is deterministic work that would add an LLM round trip and a second document/SSE pair for results, for feedback the answer key already contains — the explanations are written at generation time.

**A keyed cloud TTS provider (OpenAI/Azure).** Lost: API keys and settings plumbing buy the same neural-class quality the keyless Edge Read Aloud service already delivers through `msedge-tts`. The first cut used browser speech synthesis alone and shipped, but its default voices were too robotic for listening training, so the keyless Edge proxy replaced it the same day; browser synthesis survives as the offline/failure fallback.

**Parsing the chat exercise template.** Lost twice over in the placement decision already: chat-text parsing breaks on wording drift, and a readable transcript defeats listen-first.

## Consequences

Round integrity depends on the model following the write instruction: a skipped or malformed write leaves the page in its cancellable generating state, never a corrupted UI, because the parser rejects bad documents. An abandoned round leaves the session document behind; the next page visit offers it again, and the next generation overwrites it. The answer key ships to the browser — acceptable for a single-learner local app. A result POST with no pending session document returns 409; the page still shows the graded round with a not-recorded hint. Edge audio re-rates instantly through `playbackRate`, and switching voice restarts the utterance; only the browser-synthesis fallback restarts on a speed change, because speechSynthesis cannot re-rate mid-utterance. The Edge Read Aloud endpoint is undocumented and could tighten or vanish; its failure path degrades the player to the local fallback instead of breaking the round, and the SSML template interpolates content raw, so the bundle escapes `&`/`<`/`>` before synthesis.

## Testing

`listening.ts` is unit-tested in `packages/bundle/english-learning/tests/listening.spec.ts` beside `placement.spec.ts`: tolerant-parse matrices (optional fields, per-question validation, out-of-range answer indexes), path matching including look-alike directories, and write-classification guards. `tts.ts` is unit-tested in `tests/tts.spec.ts` for the SSML escaping, the voice guard, and cache-key derivation; live synthesis is exercised against the real service through the endpoint by hand.
