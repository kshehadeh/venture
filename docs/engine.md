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
  - `health`: durability; dropping to ≤ 0 triggers unconscious effect, ≤ -10 triggers dead effect.
  - `willpower`: resilience against fear/stress; gates certain actions and mental challenges.
  - `perception`: awareness; improves accuracy and discovery chances. Also determines which objects are visible (objects with `perception` ≤ character's current `perception` are visible).
  - `reputation`: social capital; affects NPC reactions and social checks.
  - `strength`: physical power; determines carrying capacity (capacity = current strength × 10). Containers with strength traits add to effective strength.
  - `agility`: quickness and dexterity; used for fast actions, avoiding attacks, and moving through obstacles.
- **Base vs Current Stats**: 
  - **Base Stats**: Immutable foundation values stored in `CharacterState.baseStats`. These represent the character's inherent capabilities.
  - **Current Stats**: Calculated dynamically from base stats + object stat modifiers + effect static modifiers. Stored in `CharacterState.stats` and recalculated each turn.
  - **Stat Calculation Order**: Base stats → Object modifiers → Effect static modifiers
- **Traits** (qualitative modifiers): keywords such as `reckless`, `cautious`, `storm_touched` that shift odds or unlock actions.
- **Effects System**: Status effects that modify character capabilities:
  - **Static Modifiers**: Applied during stat calculation (non-cumulative). Example: `blindness` sets perception to 0.
  - **Per-Turn Modifiers**: Applied to base stats each turn (cumulative). Example: `poison` reduces health by 1 each turn.
  - **Duration**: Effects can be temporary (with turn-based duration) or permanent (no duration).
  - **Built-in Effects**: `blindness`, `unconscious`, `dead`, `poison`
  - **Game-Specific Effects**: Defined in `effects.json` in game directory
- **Inventory**: item references with quantities; items can supply modifiers or actions.
  - **Hand-Held Items**: Characters can hold up to 2 items in their hands (tracked via "left-hand" and "right-hand" containers). Containers don't use hand-held slots.
  - **Container Storage**: Objects with the "container" trait can hold other objects. Items stored in containers count toward the container's `maxWeight` and dimensional limits (width, height, depth).
  - **Container Strength**: Containers with strength traits (format: "strength_5") add to the character's effective strength for carrying capacity calculations.
  - **Object Stat Modifiers**: Objects can have `statModifiers` that continuously modify character stats while carried. These are applied during stat calculation.
- **Behavior profile** (for NPCs, optional for players):
  - **aggression** (0–1): how likely to choose offensive actions.
  - **caution** (0–1): preference for defensive/escape options.
  - **loyalty** (0–1): likelihood to assist allies.
  - **curiosity** (0–1): tendency to explore/interact.
  - Profiles can be derived from traits to keep authoring simple.

## Objects System

Objects can exist in scenes and be picked up by players:

- **Object Attributes**: Each object has `id`, `weight`, `perception` (visibility requirement), `removable` (whether it can be picked up), `description`, `traits`, and optional dimensions (`width`, `height`, `depth`).
- **Perception Requirements**: Objects with `perception` > character's current `perception` stat are not visible. The `getVisibleObjects()` function filters objects based on current perception (calculated via `StatCalculator`).
- **Object Stat Modifiers**: Objects can have `statModifiers` that continuously modify character stats while carried. These modifiers are applied during stat calculation and stack with other modifiers.
- **Object Effects**: 
  - `carryEffects`: Applied when the object is successfully picked up (one-time effects).
  - `viewEffects`: Applied when the object is looked at (via "look" action).
  - `proximityEffect`: Applied automatically when entering a scene containing the object.
- **Container Objects**: Objects with the "container" trait can hold other objects:
  - **Weight Constraints**: Container has a `maxWeight` attribute. Total weight of all items in container (including nested items) must not exceed this.
  - **Dimensional Constraints**: Container has `width`, `height`, `depth`. Sum of dimensions of all items in container must fit within these limits.
  - **Container Strength**: Containers can have strength traits (e.g., "strength_5") that add to character's effective strength for carrying capacity.

## Action resolution outline

- **Inputs**: `ActionIntent` objects: `{ actorId, type, targetId?, itemId?, choiceId?, metadata? }`. Type can be `'choice'`, `'use_item'`, or `'pickup'`.
- **Checks**: requirement validation using current stat thresholds (calculated via `StatCalculator`), trait/flag presence, and item availability. For pickup actions, also validates perception (current), removability, weight, and capacity.
- **Rolls**: deterministic RNG seeded per session/turn to allow reproducible outcomes; combine current stat (base + modifiers) + trait modifiers + situational modifiers.
- **Outcomes**: structured result containing success grade (fail/partial/success/critical), deltas (applied to baseStats), applied flags/conditions/effects, and log entries.
- **Damage/effects**: stat deltas modify baseStats (not current stats). Effects can be applied/removed. Per-turn effect modifiers are applied during end-of-turn ticking.

## Personality impact on mechanics

- Traits and behavior profiles influence action selection weights and modifiers:
  - `reckless`: favors high-risk/high-reward actions; penalty to defense rolls.
  - `cautious`: prefers defensive/support actions; bonus to avoidance, lower crit chance.
  - `storm_touched`: unlocks storm-related interactions; may add hidden consequences.
- Narrative choices can be gated or flavored by traits/flags without hardcoding presentation into the engine (content data drives availability).

## Effects System

The effects system (`src/core/effects.ts`) manages status effects on characters:

- **Effect Types**:
  - **Temporary**: Effects with a duration that expires after a number of turns
  - **Permanent**: Effects without a duration that persist until explicitly removed
- **Modifier Types**:
  - **Static Modifiers**: Applied during stat calculation (non-cumulative). Example: `blindness` sets perception to 0.
  - **Per-Turn Modifiers**: Applied to base stats each turn (cumulative). Example: `poison` with `perTurnModifiers: { health: -1 }` reduces health by 1 each turn.
- **Effect Application**: Effects are applied via `EffectManager.applyEffect()` and stored in `CharacterState.effects`.
- **Effect Ticking**: At the end of each turn, `EffectManager.tickEffects()` is called:
  - Decrements duration for temporary effects
  - Applies per-turn modifiers to base stats (cumulative)
  - Removes expired effects (duration ≤ 0)
- **Effect Removal**: Effects can be removed via `EffectManager.removeEffect()` or expire naturally when duration reaches 0.
- **Built-in Effects**: The engine provides several built-in effects:
  - `blindness`: Sets perception to 0 (static modifier, permanent until removed)
  - `unconscious`: Applied when health ≤ 0 (static modifier)
  - `dead`: Applied when health ≤ -10 (static modifier, permanent)
  - `poison`: Reduces health by 1 each turn (per-turn modifier, temporary)

## Stat Calculation System

The stat calculation system (`src/core/stats.ts`) handles computation of current stats:

- **StatCalculator Class**: Provides methods for calculating current stats from base + modifiers
- **Calculation Process**:
  1. Start with `baseStats` (immutable foundation)
  2. Apply object stat modifiers from all carried objects (including nested objects in containers)
  3. Apply effect static modifiers from all active effects
  4. Return computed current stats
- **Current Stats**: Stored in `CharacterState.stats` and recalculated:
  - After each turn (after effects tick)
  - When objects are picked up/dropped
  - When effects are applied/removed
- **Per-Turn Modifiers**: Applied to base stats during `tickEffects()`, so they compound over time. This allows effects like poison to gradually reduce health.

## Container Logic

The container system (`src/core/container.ts`) provides utilities for managing containers:

- **Weight Calculation**: `calculateContainerWeight()` recursively calculates total weight including all nested items.
- **Space Checking**: `canFitInContainer()` validates if an item can fit based on weight and dimensional constraints.
- **Container Finding**: `findContainerInInventory()` finds the first container in inventory that can hold an item.
- **Effective Strength**: `getEffectiveStrength()` calculates character strength including container strength bonuses. Uses current strength stat (via `StatCalculator`).

## Data boundaries

- **Content**: scenes/choices/objects remain data-driven (JSON) and reference character/world state via ids and flags.
- **Engine**: operates on plain data shapes (no UI objects) and produces serialized `GameState` snapshots plus event logs.
- **Adapters**: UIs translate user input into `ActionIntent` or choice selection; they render engine outputs.

## Next steps (implementation-oriented)

- Define TypeScript types for `GameState`, `CharacterState`, `ActionIntent`, `ResolutionResult`, and `TurnSnapshot` (headless, serializable).
- Implement pure functions for requirement checking and effect application (unit-testable).
- Add deterministic RNG utilities (seeded per session/turn) for reproducible outcomes.
- Model a simple initiative system and per-actor resolution loop (without UI hooks yet).
