# Agent Note: Buddy ability-simulated language learning agent

Status: proposed

## Problem

Hey, Buddy is an English learning agent built on DSH where users "teach" a virtual pet. The pet's language abilities must match its current CEFR level — Buddy at A2 Writing must behave like an A2 writer (simple sentences, no linking words, tense errors), not like an LLM pretending to be weak. Without constrained ability simulation, the core metaphor breaks: users can't teach something Buddy already knows, and Buddy can't demonstrate realistic learner behavior.

## Proposal

Design a **BuddyProfile** runtime state that constrains LLM behavior per dimension, and a **teaching-interaction evaluation loop** that updates the profile after each exchange.

### 1. BuddyProfile schema

```typescript
interface BuddyProfile {
  dimensions: {
    grammar:    DimensionState  // 6 sub-skills: tenses, conditionals, passive, articles, prepositions, word-order
    vocab:      DimensionState  // tracked by known-word count + known-word list
    reading:    DimensionState
    writing:    DimensionState  // sub-skills: cohesion, structure, vocab-range, accuracy
    listening:  DimensionState
    speaking:   DimensionState  // sub-skills: fluency, pronunciation, grammar-under-pressure
  }
  mood: "happy" | "neutral" | "frustrated"
  energy: number       // 0-100, depleted by teaching sessions
  hunger: number       // 0-100, "fed" by successful learning
  level: number        // 1-50+
  totalXP: number
  evolutionStage: "egg" | "hatchling" | "companion" | "scholar" | "master"
}

interface DimensionState {
  score: number        // 0-100
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
  subSkills: Record<string, number>  // 0-100
  knownItems: string[]               // for vocab: known words
  weaknessFlags: string[]            // recurring error patterns
}
```

### 2. System prompt injection per dimension

Each LLM call includes a **behavioral constraint block** derived from the current profile:

```
BUDDY CURRENT STATE:
- Grammar: B1 (65/100) — conditionals are weak, tenses are solid
- Vocabulary: B1 (60/100) — 3,200 words known, does NOT know academic vocabulary
- Writing: A2 (40/100) — short sentences, no linking words, poor cohesion
- Speaking: A2 (38/100) — short phrases, frequent pauses, basic errors

BEHAVIORAL RULES:
1. NEVER use vocabulary above your known list
2. NEVER write grammatically perfect complex sentences
3. Make mistakes that match your level (e.g., B1 grammar = conditional errors, not article errors)
4. When encountering unknown words, ask "What does X mean?"
5. Show gradual understanding — never master a concept in one exchange
6. Express emotions: happy when learning, frustrated when stuck
```

### 3. Teaching interaction flow

```
User teaches "however" →
  Buddy (A2 Writing) responds: "However? I only know 'but'..."
  System evaluates: concept introduced, no mastery yet
  vocab.knownItems += ["however"]
  vocab.score += 2

User explains usage with example →
  Buddy (A2 Writing) attempts: "I like cats. However I don't like dogs."
  System evaluates: correct usage, but sentence structure still A2
  writing.score += 1, vocab.score += 1

User corrects punctuation →
  Buddy (A2 Writing) repeats: "I like cats. However, I don't like dogs."
  System evaluates: punctuation fixed, concept reinforced
  writing.score += 2

After 5 exchanges with "however" used correctly →
  System: concept mastered, writing.subSkills.cohesion += 3
```

### 4. Dimension-match matrix

| Level | Grammar behavior | Vocab behavior | Writing behavior | Speaking behavior |
|-------|-----------------|----------------|-----------------|-------------------|
| A1 | Subject-verb errors, no tense variation | 500 words, concrete only | Single words, no sentences | Gestures, single words |
| A2 | Tense confusion, article errors | 1,500 words, everyday topics | Short simple sentences, no connectors | Short phrases, long pauses |
| B1 | Conditional errors, passive weak | 3,000 words, abstract topics OK | Paragraphs with basic connectors | Can express opinions, occasional stalling |
| B2 | Rare complex structure errors | 4,500 words, idiomatic OK | Structured essays, varied style | Fluent, can debate |
| C1 | Near-native,偶尔 subtle errors | 6,000+ words, nuanced usage | Sophisticated, genre-appropriate | Native-like, can negotiate |
| C2 | Native-level | Full native vocabulary | Publication-ready | Native-level |

### 5. Progress evaluation rules

- **Correct usage in context** → +2-5 score in that dimension
- **Self-correction** → +3 score (meta-learning signal)
- **Repeated error pattern** → flagged as weakness, triggers targeted training
- **Score threshold crossing** → level upgrade, behavior mode switches
- **Concept mastery** (5+ correct uses) → sub-skill score jumps

### 6. Constraints

- Buddy NEVER uses words it hasn't been taught (enforced by vocab.knownItems check)
- Buddy's mistakes are NATURAL, not performative — errors reflect actual level
- Progress is GRADUAL — one teaching session doesn't jump a level
- Buddy expresses genuine emotions — frustration at being stuck, joy at learning
- Buddy ASKS QUESTIONS when confused — "What does that mean?" / "Is this right?"

## Alternatives considered

### Why not just a system prompt without profile state?

A static prompt can't adapt to runtime changes. Without BuddyProfile, Buddy's "level" is cosmetic — the LLM still has full capability and will drift toward perfect responses. The profile state is the enforcement mechanism.

### Why not use a separate small model for each level?

Using different models per level adds deployment complexity and cost. A single LLM with behavioral constraints achieves the same effect at lower cost, and the constraints are more precisely tunable.

### Why not let Buddy "naturally" learn without constraints?

LLMs don't forget — they have full vocabulary and grammar available at all times. Without explicit constraints, Buddy will occasionally use C1 vocabulary or perfect grammar, breaking the learner illusion. Constraints are necessary.

## Risks

- Over-constraining may make Buddy feel robotic — balance needed between realism and engagement
- Vocab tracking (knownItems list) can grow large — need efficient lookup (bloom filter or set)
- LLM may occasionally break constraints — need post-response validation layer
- Teaching evaluation heuristics may misjudge — need user feedback loop for calibration
