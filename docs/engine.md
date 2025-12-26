# Game Engine Outline

This document sketches the headless engine concepts: turn structure, character model, and action resolution. It is intentionally rendering-agnostic so any UI (TUI, web, tests) can drive the loop.

## Turn structure (deterministic sequence)

Each turn executes predictable steps to avoid side effects leaking across phases:

1. **Input collection**: gather player intent (choice selection, targeted action, item use). NPC intents are produced by AI/policy.
2. **Validation**: check requirements (stats, traits, flags, inventory, cooldowns). Reject or degrade invalid inputs with structured errors.
3. **Initiative & ordering**: build an ordered queue for resolution (player first by default; allow speed/initiative modifiers later).
4. **Resolution** (per actor in order):
   - Determine action type (attack, defend, interact, narrative choice, item use, ability).
   - Calculate modifiers (stats, traits, conditions, situational flags, equipment).
   - Roll/resolve outcomes deterministically for a given seed (supports replay/testing).
   - Apply effects (stat deltas, flags, inventory changes, conditions) and log events.
5. **World updates**: apply global or scene-level changes (time/turn increment, visit markers, environmental flags).
6. **End-of-turn checks**: detect failure/success states (e.g., health ≤ 0, narrative end), enqueue status effects for next turn, and surface prompts for the next input phase.

## Character model (player & NPC)

Minimal attribute set to influence success odds, damage, and personality weighting:

- **Stats** (numerical, bounded):
  - `health`: durability; dropping to ≤ 0 triggers defeat or incapacitation.
  - `willpower`: resilience against fear/stress; gates certain actions.
  - `perception`: awareness; improves accuracy and discovery chances.
  - `reputation`: social capital; affects NPC reactions and social checks.
  - `speed` (optional extension): influences initiative/turn order.
- **Traits** (qualitative modifiers): keywords such as `reckless`, `cautious`, `storm_touched` that shift odds or unlock actions.
- **Conditions/status**: temporary flags with durations (e.g., `bleeding`, `focused`).
- **Inventory**: item references with quantities; items can supply modifiers or actions.
- **Behavior profile** (for NPCs, optional for players):
  - **aggression** (0–1): how likely to choose offensive actions.
  - **caution** (0–1): preference for defensive/escape options.
  - **loyalty** (0–1): likelihood to assist allies.
  - **curiosity** (0–1): tendency to explore/interact.
  - Profiles can be derived from traits to keep authoring simple.

## Action resolution outline

- **Inputs**: `ActionIntent` objects: `{ actorId, type, targetId?, itemId?, choiceId?, metadata? }`.
- **Checks**: requirement validation using stat thresholds, trait/flag presence, and item availability.
- **Rolls**: deterministic RNG seeded per session/turn to allow reproducible outcomes; combine base stat + trait modifiers + situational modifiers.
- **Outcomes**: structured result containing success grade (fail/partial/success/critical), deltas, applied flags/conditions, and log entries.
- **Damage/effects**: stat deltas allow positives/negatives; conditions can tick in end-of-turn.

## Personality impact on mechanics

- Traits and behavior profiles influence action selection weights and modifiers:
  - `reckless`: favors high-risk/high-reward actions; penalty to defense rolls.
  - `cautious`: prefers defensive/support actions; bonus to avoidance, lower crit chance.
  - `storm_touched`: unlocks storm-related interactions; may add hidden consequences.
- Narrative choices can be gated or flavored by traits/flags without hardcoding presentation into the engine (content data drives availability).

## Data boundaries

- **Content**: scenes/choices remain data-driven (JSON) and reference character/world state via ids and flags.
- **Engine**: operates on plain data shapes (no UI objects) and produces serialized `GameState` snapshots plus event logs.
- **Adapters**: UIs translate user input into `ActionIntent` or choice selection; they render engine outputs.

## Next steps (implementation-oriented)

- Define TypeScript types for `GameState`, `CharacterState`, `ActionIntent`, `ResolutionResult`, and `TurnSnapshot` (headless, serializable).
- Implement pure functions for requirement checking and effect application (unit-testable).
- Add deterministic RNG utilities (seeded per session/turn) for reproducible outcomes.
- Model a simple initiative system and per-actor resolution loop (without UI hooks yet).
