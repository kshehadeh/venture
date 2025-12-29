# Game Engine Outline

This document sketches the headless engine concepts: turn structure, character model, and action resolution. It is intentionally rendering-agnostic so any UI (TUI, web, tests) can drive the loop.

## Turn structure (deterministic sequence)

Each turn executes predictable steps to avoid side effects leaking across phases. The turn processing is handled by `processTurn()` in `packages/engine/src/engine.ts`:

1. **Input collection**: gather player intent (choice selection, targeted action, item use). This happens before `processTurn()` is called, typically in `GameEngine.processInput()`. NPC intents would be produced by AI/policy (not yet implemented).

2. **Context validation**: verify that the scene context matches the current game state. If there's a mismatch, the turn is rejected.

3. **Command resolution**: 
   - The `ActionIntent` is matched to a command via `CommandRegistry.findCommand()`, which:
     - Iterates through all registered commands
     - Calls `matchesIntent(intent)` on each command to find the one that handles the intent
     - Each command's `matchesIntent()` checks if `intent.type === this.getCommandId()`
     - Returns the matching command or null if no command matches
   - The command's `resolve()` method is called, which:
     - **Validates requirements** (stats, traits, flags, inventory) using `validateRequirements()` from `packages/engine/src/validation.ts`. Invalid actions return a failure `ResolutionResult`.
     - **Determines action type** and calculates outcomes based on the specific command logic.
     - **Produces a `ResolutionResult`** containing narrative text, effects to apply, and optional next scene ID.
   - Note: Validation is performed *inside* command resolution, not as a separate pre-resolution step.

4. **Proximity effects**: If the resolution results in a scene transition (`nextSceneId` differs from current scene), proximity effects from visible objects in the new scene are collected and merged into the resolution result's effects.

5. **Apply effects**: The `applyEffects()` function from `packages/engine/src/resolution.ts` applies the resolution result to the game state:
   - Updates character `baseStats` (not current stats) with stat deltas
   - Adds/removes traits and flags
   - Applies/removes effects via `EffectManager.applyEffect()` / `EffectManager.removeEffect()`
   - Updates inventory (adds/removes items, handles container storage)
   - Handles scene transitions and marks visited scenes
   - Updates scene objects (removes picked-up items)

6. **Effect ticking**: For all characters, `EffectManager.tickEffects()` is called:
   - Applies per-turn modifiers to `baseStats` (cumulative - modifies base stats directly)
   - Decrements duration for temporary effects
   - Removes expired effects (duration ≤ 0)
   - Returns updated characters with new base stats and effect lists

7. **Stat recalculation**: Current stats are recalculated for all characters using `StatCalculator.updateCharacterStats()`, which:
   - Starts with `baseStats`
   - Applies object stat modifiers from carried items
   - Applies effect static modifiers from active effects

8. **Record action**: The action intent is appended to `actionHistory` with a timestamp.

9. **Logging and turn increment**: 
   - The narrative text from resolution is appended to the log
   - The world turn counter is incremented

**Note**: The engine currently handles only the player actor. Initiative systems and multi-actor resolution are not yet implemented. Automatic end-of-turn checks for failure states (e.g., health ≤ 0 triggering unconscious/dead effects) are not performed; effects must be explicitly applied through action resolution or game content.

## Character model (player & NPC)

Minimal attribute set to influence success odds, damage, and personality weighting:

- **Stats** (numerical, bounded):
  - `health`: durability; the engine provides built-in `unconscious` and `dead` effects, but these are not automatically applied based on health thresholds. Game content must explicitly apply these effects when health drops to ≤ 0 (unconscious) or ≤ -10 (dead).
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
- **Inventory**: item references with quantities; items can supply modifiers or actions. See [Inventory and Objects System](inventory-and-objects.md) for detailed documentation on object tracking, inventory management, and container systems.
- **Behavior profile** (for NPCs, optional for players):
  - **aggression** (0–1): how likely to choose offensive actions.
  - **caution** (0–1): preference for defensive/escape options.
  - **loyalty** (0–1): likelihood to assist allies.
  - **curiosity** (0–1): tendency to explore/interact.
  - Profiles can be derived from traits to keep authoring simple.

## Objects and Inventory System

For detailed documentation on objects, inventory management, container systems, and command target resolution, see [Inventory and Objects System](inventory-and-objects.md).

## Action resolution outline

- **Inputs**: `ActionIntent` objects: `{ actorId, type, targetId?, itemId?, metadata? }`. The `type` field is a string that must match a command ID from the command registry (e.g., `'look'`, `'pickup'`, `'move'`, `'items'`, `'transfer'`, `'effects'`, `'help'`).
- **Command-based resolution**: Each action is handled by a command class (implementing the `Command` interface) registered in the `CommandRegistry`. Commands are identified by matching the intent's `type` field to a command ID via `CommandRegistry.findCommand()`, which iterates through commands and calls `matchesIntent()` on each one. Commands are responsible for:
  - **Validation**: Requirement checking using `validateRequirements()` from `packages/engine/src/validation.ts`. This validates current stat thresholds (calculated via `StatCalculator`), trait/flag presence, and item availability. For pickup actions, also validates perception (current), removability, weight, and capacity.
  - **Resolution logic**: Command-specific logic to determine outcomes based on game state and intent.
  - **Result production**: Commands return a `ResolutionResult` containing narrative text, effects, and optional next scene ID.
- **Rolls**: Deterministic RNG seeded per session/turn to allow reproducible outcomes (not yet implemented; would combine current stat (base + modifiers) + trait modifiers + situational modifiers).
- **Outcomes**: `ResolutionResult` contains:
  - `outcome`: `'success'`, `'failure'`, or `'partial'`
  - `narrativeResolver`: Text to display to the player
  - `effects`: `ActionEffects` object with stat deltas, trait/flag changes, inventory changes, and effect additions/removals
  - `nextSceneId`: Optional scene transition target
- **Effect application**: Stat deltas modify `baseStats` (not current stats). Effects are applied/removed via `EffectManager.applyEffect()` / `EffectManager.removeEffect()`. Per-turn effect modifiers are applied to base stats during end-of-turn ticking (step 6 in turn structure) and are cumulative - they modify base stats directly, so they compound over time.

## Personality impact on mechanics

- Traits and behavior profiles influence action selection weights and modifiers:
  - `reckless`: favors high-risk/high-reward actions; penalty to defense rolls.
  - `cautious`: prefers defensive/support actions; bonus to avoidance, lower crit chance.
  - `storm_touched`: unlocks storm-related interactions; may add hidden consequences.
- Narrative choices can be gated or flavored by traits/flags without hardcoding presentation into the engine (content data drives availability).

## Effects System

The effects system (`packages/engine/src/effects.ts`) manages status effects on characters through the `EffectManager` class:

- **EffectManager**: Central class for managing effects:
  - **Effect Definitions**: Stores both built-in effect definitions (blindness, unconscious, dead, poison) and game-specific effect definitions (from `game.json` or `effects.json`)
  - **Effect Application**: `applyEffect(character, effectId, duration?)` creates an effect from its definition and adds it to the character
  - **Effect Removal**: `removeEffect(character, effectId)` removes a specific effect from a character
  - **Effect Ticking**: `tickEffects(character)` processes all effects on a character:
    - Applies per-turn modifiers to base stats (cumulative - modifies base stats directly)
    - Decrements duration for temporary effects
    - Removes expired effects (duration ≤ 0)
    - Returns updated character with new base stats and effect list

- **Effect Types**:
  - **Temporary**: Effects with a duration that expires after a number of turns
  - **Permanent**: Effects without a duration (undefined) that persist until explicitly removed

- **Modifier Types**:
  - **Static Modifiers** (`statModifiers`): Applied during stat calculation (non-cumulative). These are merged and applied when calculating current stats from base stats. Example: `blindness` sets perception to 0.
  - **Per-Turn Modifiers** (`perTurnModifiers`): Applied to base stats each turn during `tickEffects()` (cumulative - they modify base stats directly, so they compound over time). Example: `poison` with `perTurnModifiers: { health: -1 }` reduces health by 1 each turn, and this reduction persists.

- **Effect Application Flow**:
  1. Effects are applied via `ActionEffects.addEffects` in resolution results
  2. `applyEffects()` in `resolution.ts` calls `EffectManager.applyEffect()` for each effect ID
  3. `EffectManager.applyEffect()` looks up the effect definition (built-in or game-specific), creates an `Effect` instance, converts it to `CharacterEffect`, and calls `character.addEffect()`
  4. Effects are stored in `CharacterState.effects` as `CharacterEffect[]`

- **Effect Ticking Flow**:
  1. After effects are applied each turn, `EffectManager.tickEffects()` is called for all characters
  2. For each effect:
     - Per-turn modifiers are applied to base stats (cumulative - base stats are modified directly)
     - Duration is decremented by 1
     - If duration ≤ 0, the effect is removed
  3. Updated character is returned with new base stats and effect list

- **Built-in Effects**: The engine provides several built-in effects:
  - `blindness`: Sets perception to 0 (static modifier, permanent until removed)
  - `unconscious`: Reduces agility to effectively 0 (static modifier). Note: This effect is not automatically applied when health ≤ 0; game content must explicitly apply it.
  - `dead`: Reduces health and agility to effectively 0 (static modifier, permanent). Note: This effect is not automatically applied when health ≤ -10; game content must explicitly apply it.
  - `poison`: Reduces health by 1 each turn (per-turn modifier, temporary with default duration of 5 turns)

- **Game-Specific Effects**: Effects can be defined in game content (via `effectDefinitions` in `GameState` or `game.json`). These are loaded into `EffectManager` and work the same way as built-in effects.

## Stat Calculation System

The stat calculation system (`packages/engine/src/stats.ts`) handles computation of current stats:

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


## Data boundaries

- **Content**: scenes/choices/objects remain data-driven (JSON) and reference character/world state via ids and flags.
- **Engine**: operates on plain data shapes (no UI objects) and produces serialized `GameState` snapshots plus event logs.
- **Adapters**: UIs translate user input into `ActionIntent` or choice selection; they render engine outputs.

## Next steps (implementation-oriented)

- ✅ TypeScript types for `GameState`, `CharacterState`, `ActionIntent`, `ResolutionResult` are defined (headless, serializable).
- ✅ Pure functions for requirement checking (`validateRequirements`) and effect application (`applyEffects`) are implemented (unit-testable).
- ⏳ Add deterministic RNG utilities (seeded per session/turn) for reproducible outcomes (not yet implemented).
- ⏳ Model a simple initiative system and per-actor resolution loop (currently only handles player actor).
- ⏳ Implement automatic end-of-turn checks for failure states (e.g., health thresholds triggering unconscious/dead effects).
