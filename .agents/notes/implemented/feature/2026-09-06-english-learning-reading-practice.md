# Agent Note: English-learning reading practice page

Status: implemented

English | [中文](2026-09-06-english-learning-reading-practice.zh.md)

## Problem

Reading was the only practiced ability with neither a page nor a skill template: the exercise-generator skill had templates for listening, vocabulary, speaking, and writing but nothing for reading comprehension, so reading rounds only happened when the model improvised. The listening page proved the quiz shape (passage plus four-option questions with an answer key) and the speaking page proved the pipeline generalizes; reading needed both.

## Decision

**Reading practice reuses the listening quiz pipeline end to end, and the addition consolidates the two quiz-shaped abilities into shared cores.**

- **`quiz.ts` owns the quiz-shaped contract.** The listening parser/classifier and its new reading sibling were near-clones, so the tolerant parsing and write-call classification now live in one zero-dependency module parameterized by document kind and session file name; `listening.ts` and `reading.ts` are thin specializations (`.english-learning/listening-session.json` / `reading-session.json`, kinds `listening-exercise` / `reading-exercise`). The public listening API is unchanged.
- **The `/reading` page is the listening page minus audio.** Same flow — pick a source (material or topic), the skill's page-driven branch (request marker 「来自阅读练习页」) writes the exercise, SSE `readingExercise` delivers it, the page grades the selections against the answer key, and `POST /api/reading/result` composes the standard `{kind: 'exercise', skill: 'reading'}` record before retiring the session; `GET /api/reading` restores a reloaded round. Differences: the passage is the content, so it renders as an always-visible reading card, and there is no player and no listen-first transcript hiding.
- **`PracticeShared.tsx` owns the page chrome.** Header, source-picker intro, generating panel, score card, and the four-option question cards are shared components consumed by the listening, reading, and speaking pages; the pages keep only their distinguishing parts (the player, the passage card, the speaking line cards). Page accent colors stay CSS-driven through a per-page wrapper class.
- **The skill gained the missing reading template.** exercise-generator now documents a reading comprehension exercise and its page-driven branch (3–5 questions over an 80–200-word passage, testing main idea, detail, inference, and word meaning); the branch never writes a progress record itself.

## Alternatives considered

**A fourth standalone parser module.** Lost to `quiz.ts`: reading's contract is byte-for-byte the listening contract with a different kind string, so a third near-clone of the parse/classify skeleton would have been pure copy drift.

**A generic "practice page" component covering all three abilities.** Lost for now: the speaking interaction (recording, recognition, per-line attempts) shares almost no body with the quiz pages, so only the chrome is shared; forcing the bodies together would couple unrelated state machines.

**Splitting reading into vocabulary drills.** Lost: vocabulary review already exists as a chat flow (词汇练习); the page targets passage comprehension, which the dashboard's reading dimension scores.

## Consequences

Round integrity and staleness semantics match the listening and speaking pipelines: a skipped or malformed write leaves the page cancellable, an abandoned session document is re-offered and overwritten, and a submission with no pending session returns 409 with a not-recorded hint. The quiz consolidation means a change to the quiz contract now lands once; the listening page's public API and tests are unchanged by the refactor. The reading passage ships to the browser in full — inherent to reading, and the reason listen-first hiding exists only on the listening page.

## Testing

`reading.ts` is unit-tested in `packages/bundle/english-learning/tests/reading.spec.ts` beside the listening and speaking specs: tolerant-parse matrices, kind discrimination against the listening document, path matching, and write classification. The page flow (answer, submit, XP update, reload restore) is exercised by hand against the live endpoints.
