# Agent Note: English-learning configurable agent skills

Status: implemented

English | [中文](2026-09-06-english-learning-skill-configuration.zh.md)

## Problem

The five preset skills (exercise-generator, material-digest, knowledge-extractor, material-search, placement-assessment) were hard-wired: the bundle registered the preset skills directory as one skill root and the tutor always saw every skill in its catalog. A learner who never wants AI-found materials or who finds the placement nudges noisy had no way to turn a capability off, and the skill system has no per-skill runtime control — its only gates are static frontmatter flags and composition-row plugin switches.

## Decision

**The dashboard's settings page gets a 技能配置 tab that toggles each preset skill, the choice persists in the english-learning settings namespace, and a filtering provider wrapper makes the tutor's catalog honor it on the next turn.**

- **Filter at the provider boundary.** The bundle's `FileSystemSkillProvider` registration now retains the registration's `SkillProviderControl` and returns a thin wrapper provider whose `list()` drops candidates whose name is in the `disabledSkills` setting (`get` delegates). `FileSystemSkillProvider.list()` re-scans the directory on every registry cache miss, so the wrapper is the only filtering point needed. On a settings change the watch handler calls `control.invalidate()`, the registry bumps its revision and clears the collect cache, and `tool-skill`'s per-turn snapshot republishes the catalog digest — the tutor sees the new set on its next turn with no restart.
- **The choice is a persisted deny-list.** `disabledSkills: string[]` joins the existing english-learning settings schema (default empty — new skills stay on), so settings.yaml holds the names that are off, not the ones that are on. `POST /api/skills {name, enabled}` toggles one entry; `GET /api/skills` lists the catalog from the preset directory with frontmatter routing metadata (`name`/`description`/`whenToUse` parsed by `skill-catalog.ts`, unit-tested) plus enabled flags.
- **The settings page owns the UX.** A new 技能配置 tab lists every skill with its description, trigger condition, and a switch; toggles apply immediately (optimistic flip, reload from the server on settle). Rows whose disablement reaches past the catalog carry an explicit impact line — disabling exercise-generator takes down all four practice pages' generation, disabling placement-assessment blocks assessment.

## Alternatives considered

**Frontmatter flags (`disable-model-invocation`) edited on disk.** Lost: they are static per file, shipped with the preset, and would make the dashboard a text editor; the deny-list is data, survives preset updates, and needs no file writes.

**A whitelist of enabled skills.** Lost: a deny-list defaults new preset skills to available, so adding a sixth skill never silently hides it from learners who never opened settings.

**Filtering inside the skill registry.** Lost: per-skill enablement is this product's product decision, not a harness primitive — the registry's boundary is providers, and the bundle already owns this provider.

## Consequences

The catalog change is model-visible on the next turn but the default configuration is byte-identical to before, so nothing changes for learners who never touch the tab. A skill the tutor already loaded into its context stays in context for the current conversation — the toggle governs discovery and future turns, exactly like the model-invocable policy it extends. Disabling a skill a practice page depends on degrades that page at generation time (the generating wait ends only by cancellation), which the impact line warns about. The wrapper adds one indirection to skill loading; `get` delegates untouched, so an in-flight disabled name can still resolve if addressed directly by a stale candidate — the catalog, not the loader, is the gate.

## Testing

`skill-catalog.ts` is unit-tested in `packages/bundle/english-learning/tests/skill-catalog.spec.ts`: frontmatter parsing (quotes, missing keys), the kebab-case name guard, catalog merge with enabled flags, and toggle add/remove idempotence. The endpoints' round trip and the settings persistence are exercised by hand against the live server; the catalog republish path is the harness's own tested machinery.
