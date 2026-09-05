# Agent Note: English-learning placement assessment

Status: implemented

English | [中文](2026-09-05-english-learning-placement-assessment.zh.md)

## Problem

The english-learning app had no initial ability assessment. The agent's view of the learner came from two disconnected sources: the settings page's 当前水平 pick lived only in React state (lost on refresh, never sent to the agent), and the `material-search` skill inferred a level from material-difficulty records with an A2–B1 fallback when no records existed. A new learner therefore started from a hardcoded guess that ignored what the learner themselves could report, and nothing the learner picked in settings survived a reload or reached the agent.

## Decision

**`.english-learning/profile.json` is the single learner placement record.** Both writers produce the same `{time, kind: 'placement', source, currentLevel, skills?, weakSkills?, summary?}` document: `source: 'placement'` when the assessment skill writes it, `source: 'manual'` when the dashboard records a hand-picked level. A later write replaces the whole file — the latest intent wins, whether it came from a retake or from settings.

- **The assessment is a chat skill, not a new protocol.** The new `placement-assessment` skill (registered automatically because it lives in the preset's `skills/` directory) runs 3–4 adaptive chat rounds — background, a reading task, a writing task, optionally one speaking proxy — then evaluates the overall CEFR level plus per-skill estimates and writes the profile with the stock `write` tool. The dashboard's onboarding modal and the settings-page 重新测评 button both send a fixed prompt that names the skill and the profile path.
- **Reading and writing are observed; listening and speaking are estimates.** Text chat cannot test the aural/oral skills, so the skill marks their `skills` entries as estimates from self-report and vocabulary breadth. Consumers treat the map as advisory: `weakSkills` names the 1–2 weakest dimensions.
- **The dashboard reads the profile through `GET /api/profile`** (tolerant parse — a missing or malformed file reads as "no profile"), and writes a manual pick through `POST /api/profile`, which validates the CEFR level and stamps `source: 'manual'`. The App polls it in the same 30-second cycle as progress and vocabulary.
- **Manual picks unify into the profile.** Saving the settings page posts the changed level, so the agent sees hand-picked levels and the choice survives reloads. The settings select initializes from the effective level, so the UI never shows a stale value next to the assessed one.
- **`effectiveLevel` orders the level sources:** profile first, settings pick second, built-in default last. The top-bar badge, skill-card level range, and AI-find modal copy all render `effectiveLevel`.
- **Skills prefer the profile.** `material-search` reads `profile.json` for the current level and weak skills first, then progress records, then the A2–B1 fallback; `exercise-generator` difficulty matching cites the profile the same way.

## Alternatives considered

**A structured quiz UI (agent emits question JSON, the dashboard renders a full-screen form).** Lost for now: it needs a new structured message protocol, an answer-submission route, and a form component — roughly 3–4× the chat-based cost — while the chat flow already streams, keeps history, and adapts difficulty turn by turn. The chat panel is the app's established interaction surface for agent work.

**Persisting the settings `currentLevel` in settings.yaml via dsh-settings.** Lost: the profile file is already the agent-readable placement record, so a second persisted copy would split the source of truth. The settings select remains the pre-assessment display value.

## Consequences

First-run visitors get the onboarding modal (until assessed or dismissed via a `placement-modal-dismissed` localStorage flag), the assessment runs in the existing chat panel, and the assessed level flows into the top-bar badge, skill cards, AI-find copy, material search, and exercise difficulty. Backend changes require a server restart (webserver routes live in the bundle plugin); the frontend reaches the browser on reload. Assessment quality depends on the model following the multi-round pacing — a model that dumps all rounds at once degrades the estimate but cannot corrupt the store, since the profile parser rejects malformed documents. The other settings fields (targetLevel, daily goal, display) still do not persist; that gap is unchanged.
