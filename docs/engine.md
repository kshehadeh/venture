# Game Engine Outline

This document sketches the headless engine concepts: turn structure, character model, and action resolution. It is intentionally rendering-agnostic so any UI (TUI, web, tests) can drive the loop.

## Turn structure (deterministic sequence)

Each turn executes predictable steps to avoid side effects leaking across phases. The turn processing is handled by `processTurn()` in `src/core/engine.ts`:

1. **Input collection**: gather player intent (choice selection, targeted action, item use). This happens before `processTurn()` is called, typically in `GameEngine.processInput()`. NPC intents would be produced by AI/policy (not yet implemented).

2. **Context validation**: verify that the scene context matches the current game state. If there's a mismatch, the turn is rejected.

3. **Command resolution**: 
   - The `ActionIntent` is matched to a command via the command registry based on intent type (`choice`, `pickup`, `move`, `look`, `items`, `transfer`, `effects`, `help`).
   - The command's `resolve()` method is called, which:
     - **Validates requirements** (stats, traits, flags, inventory) using `validateRequirements()` from `src/core/validation.ts`. Invalid actions return a failure `ResolutionResult`.
     - **Determines action type** and calculates outcomes based on the specific command logic.
     - **Produces a `ResolutionResult`** containing narrative text, effects to apply, and optional next scene ID.
   - Note: Validation is performed *inside* command resolution, not as a separate pre-resolution step.

4. **Proximity effects**: If the resolution results in a scene transition (`nextSceneId` differs from current scene), proximity effects from visible objects in the new scene are collected and merged into the resolution result's effects.

5. **Apply effects**: The `applyEffects()` function from `src/core/resolution.ts` applies the resolution result to the game state:
   - Updates character `baseStats` (not current stats) with stat deltas
   - Adds/removes traits and flags
   - Applies/removes effects via `EffectManager`
   - Updates inventory (adds/removes items, handles container storage)
   - Handles scene transitions and marks visited scenes
   - Updates scene objects (removes picked-up items)

6. **Effect ticking**: For all characters, `EffectManager.tickEffects()` is called:
   - Decrements duration for temporary effects
   - Applies per-turn modifiers to `baseStats` (cumulative)
   - Removes expired effects (duration ≤ 0)

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
- **Inventory**: item references with quantities; items can supply modifiers or actions.
  - **Hand-Held Items**: Characters can hold up to 2 items in their hands (tracked via "left-hand" and "right-hand" containers). Each hand has 5 ring slots and general storage. Containers don't use hand-held slots.
  - **Container Storage**: Objects with the "container" trait can hold other objects. Items stored in containers count toward the container's `maxWeight` and dimensional limits (width, height, depth).
  - **Container Slots**: Containers can have named slots, each of which can hold exactly one item. Slots have their own weight and dimensional constraints. Items in slots are displayed separately from general container storage. Slots are useful for organizing specific item types (e.g., weapon sheaths, ring slots).
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
  - **Slots**: Containers can have named slots, each of which can hold exactly one item. Slots have their own weight and dimensional constraints (`maxWeight`, `width`, `height`, `depth`). Items in slots are displayed separately from general container storage when looking at containers or viewing inventory. Slots are useful for organizing specific item types (e.g., weapon sheaths, ring slots on hands). Items can be transferred to specific slots using the transfer command (e.g., "put sword in backpack sheath slot").

## Action resolution outline

- **Inputs**: `ActionIntent` objects: `{ actorId, type, targetId?, itemId?, choiceId?, metadata? }`. Type can be `'choice'`, `'pickup'`, `'move'`, `'look'`, `'items'`, `'transfer'`, `'effects'`, or `'help'`.
- **Command-based resolution**: Each action type is handled by a command class (implementing the `Command` interface) registered in the command registry. Commands are responsible for:
  - **Validation**: Requirement checking using `validateRequirements()` from `src/core/validation.ts`. This validates current stat thresholds (calculated via `StatCalculator`), trait/flag presence, and item availability. For pickup actions, also validates perception (current), removability, weight, and capacity.
  - **Resolution logic**: Command-specific logic to determine outcomes based on game state and intent.
  - **Result production**: Commands return a `ResolutionResult` containing narrative text, effects, and optional next scene ID.
- **Rolls**: Deterministic RNG seeded per session/turn to allow reproducible outcomes (not yet implemented; would combine current stat (base + modifiers) + trait modifiers + situational modifiers).
- **Outcomes**: `ResolutionResult` contains:
  - `outcome`: `'success'`, `'failure'`, or `'partial'`
  - `narrativeResolver`: Text to display to the player
  - `effects`: `ActionEffects` object with stat deltas, trait/flag changes, inventory changes, and effect additions/removals
  - `nextSceneId`: Optional scene transition target
- **Effect application**: Stat deltas modify `baseStats` (not current stats). Effects can be applied/removed via `EffectManager`. Per-turn effect modifiers are applied during end-of-turn ticking (step 6 in turn structure).

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
  - `unconscious`: Reduces agility to effectively 0 (static modifier). Note: This effect is not automatically applied when health ≤ 0; game content must explicitly apply it.
  - `dead`: Reduces health and agility to effectively 0 (static modifier, permanent). Note: This effect is not automatically applied when health ≤ -10; game content must explicitly apply it.
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

- **Weight Calculation**: `calculateContainerWeight()` recursively calculates total weight including all nested items and items in slots.
- **Space Checking**: `canFitInContainer()` validates if an item can fit based on weight and dimensional constraints. For slots, use `canFitInSlot()` to check if an item fits in a specific slot.
- **Container Finding**: `findContainerInInventory()` finds the first container in inventory that can hold an item.
- **Slot Management**: 
  - `findSlotInContainer()` finds a slot by ID within a container.
  - `getAvailableSlots()` returns all empty slots in a container.
  - `getSlotContents()` returns all items currently held in slots.
- **Effective Strength**: `getEffectiveStrength()` calculates character strength including container strength bonuses. Uses current strength stat (via `StatCalculator`).

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
