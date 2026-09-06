# Agent Note: English-learning writing practice page

Status: implemented

English | [中文](2026-09-06-english-learning-writing-practice.zh.md)

## Problem

Writing was the last ability without a practice surface: the skill's writing template printed a topic, requirements, and hints as chat text, the learner typed the essay back into the chat, and every round lived and died inside the chat transcript. The dashboard's writing card counted nothing the learner could point at.

## Decision

**Writing practice keeps the practice-page pipeline but changes where the grade comes from: writing has no client-verifiable answer key, so the LLM grades — the session file carries two phases, and the page collects the essay instead of picking options.**

- **One file, two phases.** A request marked 「来自写作练习页」 makes the skill write the assignment (`kind: 'writing-exercise'` — title, requirements, hint, `targetWords`) to `.english-learning/writing-session.json`; the bundle classifies the write and broadcasts `writingExercise`. After the learner submits the essay through the chat, the skill grades grammar, vocabulary, and logic, and **rewrites the same file** as the outcome (`kind: 'writing-result'` — score 0–100, summary, strengths, issues, optional revised draft), which broadcasts `writingResult`. The tolerant parser in `writing.ts` discriminates the phases by kind; `writing-session.json` plus one pending doc keeps the lifecycle symmetric with the sibling pages.
- **The page is an editor, not a quiz.** It renders the assignment as a task card with a requirements checklist, gives a textarea with a live word counter against `targetWords`, and submits through the existing chat (`onSubmitEssay` composes the grading prompt, so the detailed critique appears in the chat where every other tutor conversation lives). When `writingResult` arrives the page shows the structured outcome — score, summary, strengths, issues, revised draft — records the score exactly once by POSTing it to `/api/writing/result`, and notes that the per-item critique lives in the chat.
- **The record keeps the standard shape.** One essay counts as one question: `POST /api/writing/result` writes `{kind: 'exercise', skill: 'writing', count: 1, correct: score >= 60}` with the session's material/level, then retires the session document, so XP, streak, and accuracy aggregation are untouched. A failed submission leaves the session pending and the page offers a retry button.
- **Shared chrome, custom body.** The page consumes `PracticeShared.tsx` (header, source picker, generating panel) like its siblings and keeps a custom result panel, because a 0–100 score has no n/m semantics.

## Alternatives considered

**Client-side grammar scoring.** Lost: nothing in the browser grades grammar, vocabulary, and logic; pretending a word count is a score would degrade the record's meaning.

**A separate result file (assignment and outcome side by side).** Lost: two files double the write classification and reload logic for information that never coexists; rewriting one document matches the placement progress pattern and retires cleanly.

**Grading outside the chat (hidden prompt from the page).** Lost: the chat transcript is the learner's durable record of every critique — Model-visible ⟺ logged — and the structured result doc would duplicate a critique the chat already holds.

## Consequences

Grading depends on the model following the rewrite instruction: a skipped result write leaves the page in its cancellable grading wait, and the chat reply still carries the critique. Because the essay travels through the chat, the learner's own text is part of the transcript — intended, not leakage. The score POSTs exactly once per graded document (identity is kind+time; the POST retires the session, so a reload after grading lands on the intro while the full critique stays in the chat). A stale instance serves the new page from disk but 404s the new endpoints until restarted.

## Testing

`writing.ts` is unit-tested in `packages/bundle/english-learning/tests/writing.spec.ts` beside the sibling specs: phase discrimination (assignment vs outcome), score bounds, requirement and list validation, path matching, and write classification. The full flow — write, submit, graded outcome arrival, score record, XP update — is exercised by hand against the live endpoints.
