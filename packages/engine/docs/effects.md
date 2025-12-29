# Effects System

This document describes the effects system in Venture, which manages both persistent character status effects and immediate action effects that modify game state.

## Overview

The effects system in Venture consists of two complementary types:

1. **Character Effects** (`EffectDefinition`): Reusable status effect templates that can be applied to characters (e.g., poison, blindness). These persist over multiple turns and can modify stats, have durations, and tick each turn.

2. **Action Effects** (`ActionEffects`): Immediate effects applied during action resolution that modify game state (stats, traits, flags, inventory, etc.). These are one-time changes that occur when an action is resolved.

## Character Effects (EffectDefinition)

Character effects are status conditions that persist on characters over time. They are defined as templates and can be applied, ticked each turn, and removed.

### EffectDefinition Interface

```typescript
interface EffectDefinition {
    id: string;                    // Unique identifier
    name: string;                  // Display name
    description: string;           // Description text (shown when viewing active effects)
    applicationDescription?: string; // Optional description shown when effect is applied (e.g., "You feel somehow energized...")
    statModifiers?: Partial<StatBlock>;      // Static stat modifiers (applied during stat calculation)
    perTurnModifiers?: Partial<StatBlock>;  // Per-turn stat changes (applied to base stats each turn)
    duration?: number;             // Default duration in turns (undefined = permanent)
    builtin?: boolean;             // Is this a built-in engine effect?
}
```

### Application Descriptions

Effects can have an optional `applicationDescription` field that provides narrative text when the effect is first applied. This creates a more immersive experience by showing immediate feedback to the player.

- **`description`**: Shown when viewing active effects (via the "effects" command)
- **`applicationDescription`**: Shown when the effect is first applied (as a log entry with type `'effect'`)

Example:
```json
{
  "id": "strength_boost",
  "name": "Strength Boost",
  "description": "You feel incredibly strong. Your muscles feel more powerful than usual.",
  "applicationDescription": "You feel somehow energized... A surge of power courses through your muscles.",
  "statModifiers": {
    "strength": 2,
    "agility": 1
  },
  "duration": 3
}
```

When this effect is applied, the player will see:
- An `'effect'` type log entry with the `applicationDescription` text (displayed in magenta italic)
- A `'mechanic'` type log entry showing the effect name and duration

### Modifier Types

Character effects have two types of stat modifiers:

- **Static Modifiers** (`statModifiers`): Applied during stat calculation (non-cumulative). These are merged with other static modifiers when calculating current stats from base stats. Example: `blindness` sets perception to 0.

- **Per-Turn Modifiers** (`perTurnModifiers`): Applied to base stats each turn during `tickEffects()` (cumulative - they modify base stats directly, so they compound over time). Example: `poison` with `perTurnModifiers: { health: -1 }` reduces health by 1 each turn, and this reduction persists.

### Effect Duration

Effect duration controls how long an effect persists on a character:

- **Temporary Effects**: Effects with a `duration` property expire after that many turns. Duration is decremented by 1 each turn during `tickEffects()`. When duration reaches 0, the effect is automatically removed.

- **Permanent Effects**: Effects without a `duration` (undefined) persist until explicitly removed via `removeEffect()` or when their source is removed (see Effect Source Tracking below).

#### Duration Handling Flow

1. **Application**: When an effect is applied, its duration is set from:
   - The `duration` parameter passed to `applyEffect()` (if provided), or
   - The effect definition's default `duration` (if specified), or
   - `undefined` (permanent effect)

2. **Ticking**: Each turn, after all effects are applied, `EffectManager.tickEffects()` is called:
   - For each effect with a defined duration:
     - Duration is decremented by 1
     - If duration ≤ 0, the effect is removed
   - For permanent effects (duration undefined):
     - Duration is not decremented
     - Effect remains active

3. **Expiration**: When an effect expires (duration reaches 0):
   - The effect is removed from the character's effects array
   - A log entry is created: `"The effect '[name]' has worn off."` (type: `'mechanic'`)
   - Only shown for the player character

4. **Per-Turn Modifiers**: Before duration is decremented, any `perTurnModifiers` are applied to the character's base stats (cumulative).

#### Example Duration Flow

For an effect with `duration: 3`:
- **Turn 1**: Effect applied, duration = 3
- **Turn 2**: After tick, duration = 2 (per-turn modifiers applied)
- **Turn 3**: After tick, duration = 1 (per-turn modifiers applied)
- **Turn 4**: After tick, duration = 0 → effect removed, expiration message logged

### Built-in Character Effects

The engine provides several built-in character effects:

#### `blindness`
- **Description**: Your vision is completely obscured.
- **Static Modifier**: `perception: -999` (effectively sets perception to 0)
- **Duration**: Permanent (until removed)
- **Source**: Built-in

#### `unconscious`
- **Description**: You are unconscious and cannot act.
- **Static Modifier**: `agility: -999` (effectively sets agility to 0)
- **Duration**: Permanent (until removed)
- **Source**: Built-in
- **Note**: This effect is not automatically applied when health ≤ 0; game content must explicitly apply it.

#### `dead`
- **Description**: You are dead.
- **Static Modifiers**: `health: -999, agility: -999` (effectively sets both to 0)
- **Duration**: Permanent (until removed)
- **Source**: Built-in
- **Note**: This effect is not automatically applied when health ≤ -10; game content must explicitly apply it.

#### `poison`
- **Description**: You feel a burning sensation.
- **Per-Turn Modifier**: `health: -1` (reduces health by 1 each turn)
- **Duration**: 5 turns (default)
- **Source**: Built-in

### Game-Specific Character Effects

Game-specific character effects can be defined in `games/{gameId}/effects.json`:

```json
{
  "effects": [
    {
      "id": "regeneration",
      "name": "Regeneration",
      "description": "Your wounds heal rapidly.",
      "perTurnModifiers": {
        "health": 2
      },
      "duration": 10
    },
    {
      "id": "strength_boost",
      "name": "Strength Boost",
      "description": "You feel incredibly strong.",
      "statModifiers": {
        "strength": 5
      },
      "duration": 3
    },
    {
      "id": "cursed",
      "name": "Cursed",
      "description": "A dark curse weighs upon you.",
      "statModifiers": {
        "willpower": -3,
        "reputation": -2
      }
    }
  ]
}
```

Effects are loaded by the `Loader` and stored in `GameState.effectDefinitions`, then passed to `EffectManager` during initialization.

### EffectManager

The `EffectManager` class (`packages/engine/src/effects.ts`) manages character effects:

- **Effect Definitions**: Stores both built-in and game-specific effect definitions
- **Effect Application**: `applyEffect(character, effectId, duration?)` creates an effect from its definition and adds it to the character
- **Effect Removal**: `removeEffect(character, effectId)` removes a specific effect from a character
- **Effect Ticking**: `tickEffects(character)` processes all effects on a character:
  - Applies per-turn modifiers to base stats (cumulative - modifies base stats directly)
  - Decrements duration for temporary effects
  - Removes expired effects (duration ≤ 0)
  - Returns updated character with new base stats and effect list

### CharacterEffect Runtime Representation

When an effect is applied to a character, it's stored as a `CharacterEffect`:

```typescript
interface CharacterEffect {
    id: string;                    // Effect ID (e.g., "blindness", "poisoned")
    source: 'builtin' | 'game';   // Built-in engine effect or game-specific
    duration?: number;            // Turns remaining (undefined = permanent)
    statModifiers?: Partial<StatBlock>;      // Static stat modifiers
    perTurnModifiers?: Partial<StatBlock>;    // Cumulative stat changes per turn
    metadata?: Record<string, any>; // Additional effect data (includes source tracking)
}
```

#### Effect Source Tracking

The `metadata` field on `CharacterEffect` is used to track where effects came from, enabling automatic removal when sources change:

- **carryEffect**: Effects applied from object `carryEffects`
  - Metadata: `{ sourceType: 'carryEffect', sourceObjectId: 'sword' }`
  - Removed when: Object is dropped
  
- **proximityEffect**: Effects applied from object `proximityEffect`
  - Metadata: `{ sourceType: 'proximityEffect', sourceObjectId: 'magic_crystal', sourceSceneId: 'intro' }`
  - Removed when: Character leaves the scene

This allows effects to be automatically cleaned up when their source is no longer relevant, preventing "orphaned" effects from persisting indefinitely.

## Action Effects (ActionEffects)

Action effects are immediate, one-time changes to game state that occur when an action is resolved. They are defined in `ActionEffects` and applied via the `EffectApplier` system.

### ActionEffects Interface

```typescript
interface ActionEffects {
    stats?: Partial<Record<keyof StatBlock, number>>;  // Stat deltas (applied to baseStats)
    addTraits?: TraitId[];                            // Traits to add
    removeTraits?: TraitId[];                         // Traits to remove
    addFlags?: FlagId[];                              // World flags to add
    removeFlags?: FlagId[];                           // World flags to remove
    addItems?: InventoryEntry[];                     // Items to add to inventory
    removeItems?: InventoryEntry[];                    // Items to remove from inventory
    addEffects?: string[];                            // Character effect IDs to apply
    removeEffects?: string[];                        // Character effect IDs to remove
    targetCharacterId?: string;                      // Character ID to apply effects to (defaults to actorId)
    transferItem?: {                                  // Transfer item between containers
        itemId: string;
        fromContainerId: string | null;               // null if item is directly in inventory
        toContainerId: string;                        // destination container ID
        slotId?: string;                              // Optional slot ID within destination
    };
    hiddenConsequences?: string[];                    // Effects recorded for later resolution
    reprintNarrative?: boolean;                       // Whether to reprint scene narrative
    listInventory?: boolean;                          // Whether to list inventory after action
}
```

### Where Action Effects Are Used

Action effects can be specified in:

1. **Scene Choices**: In `*.scene.json` files, choices can have an `effects` property
2. **Object Effects**: Objects can have `carryEffects`, `viewEffects`, and `proximityEffect` properties
3. **Command Resolution**: Commands return `ResolutionResult` objects with `effects` property
4. **Detailed Descriptions**: Objects, NPCs, exits, and scenes can have `detailedDescriptions` with `effects` properties

### Object Effect Types

Objects can have three types of effects that trigger at different times:

1. **`carryEffects`**: Applied when the object is successfully picked up (one-time)
   - Effects are tracked with source metadata
   - Automatically removed when the object is dropped
   - Use for effects that should persist while carrying the item
   - Example: A sword that grants strength while carried

2. **`viewEffects`**: Applied when the object is looked at (one-time per look)
   - Not tracked or removed (one-time effects)
   - Use for immediate effects from examining something
   - Example: A cursed scroll that applies a curse when read

3. **`proximityEffect`**: Applied when entering a scene containing the object (persists while in scene)
   - Effects are tracked with source metadata
   - Automatically removed when leaving the scene
   - Persists even if the object is picked up (per user preference)
   - Example: A magic crystal that provides regeneration while in its presence

**Important**: Objects should NOT have `statModifiers` directly. Stat modifiers should be applied via effects (in `carryEffects.addEffects` or `proximityEffect.addEffects`). This ensures proper tracking and removal.

### Effect Applier System

The `EffectApplier` class (`packages/engine/src/effects/effect-applier.ts`) orchestrates the application of all action effects. It uses individual effect handler classes:

- **StatsEffect**: Applies stat deltas to character `baseStats`
- **TraitsEffect**: Adds/removes character traits
- **FlagsEffect**: Adds/removes world flags
- **CharacterEffectsEffect**: Applies/removes character effects via `EffectManager` (tracks source metadata)
- **InventoryEffect**: Adds/removes items from inventory (handles container storage)
- **TransferItemEffect**: Transfers items between containers or from inventory to container
- **SceneTransitionEffect**: Handles scene transitions (uses `result.nextSceneId`)
- **SceneObjectsEffect**: Removes objects from scene when picked up
- **VisitedScenesEffect**: Marks scenes as visited when transitioning
- **ProximityEffectRemovalEffect**: Removes proximity effects when leaving scenes

Each effect handler extends `BaseEffect` and implements:
- `shouldApply(effects: ActionEffects): boolean` - Determines if this effect should be applied
- `apply(context: EffectContext): void` - Applies the effect to game state

#### Effect Source Tracking in EffectApplier

The `EffectApplier` builds an `effectSources` map that tracks which effects came from which sources:

- **For carryEffects**: When `addItems` contains objects with `carryEffects.addEffects`, maps each effect ID to `{ type: 'carryEffect', objectId: 'sword' }`
- **For proximityEffect**: When entering a new scene, maps effect IDs from objects' `proximityEffect.addEffects` to `{ type: 'proximityEffect', objectId: 'crystal', sceneId: 'intro' }`

This map is passed to `CharacterEffectsEffect` via `EffectContext`, which stores the source information in the effect's metadata.

## How Character Effects and Action Effects Work Together

Character effects and action effects work together through the `addEffects` and `removeEffects` properties of `ActionEffects`:

1. An action's `ActionEffects` includes `addEffects: ["poison"]`
2. `CharacterEffectsEffect` processes this and calls `EffectManager.applyEffect()` with the "poison" ID
3. `EffectManager` looks up the `EffectDefinition` for "poison" and creates a `CharacterEffect` instance
4. The effect is added to the character's effects list (`CharacterState.effects`)
5. Each turn, `EffectManager.tickEffects()` processes all active effects:
   - Applies per-turn modifiers to base stats
   - Decrements durations
   - Removes expired effects

## Effect Application Flow

The complete flow of effect application during a turn:

1. **Action Resolution**: Command's `resolve()` method returns a `ResolutionResult` with `effects: ActionEffects`

2. **Proximity Effects**: If the action results in a scene transition, proximity effects from visible objects in the new scene are collected and merged into the resolution result's effects

3. **Effect Application**: `EffectApplier.applyEffects()` is called:
   - Creates a new game state clone
   - Iterates through all effect handlers
   - Each handler checks `shouldApply()` and applies its effects if needed
   - Effects update `context.character` and `context.nextState` directly

4. **Effect Ticking**: After effects are applied, `EffectManager.tickEffects()` is called for all characters:
   - For each active effect:
     - Per-turn modifiers are applied to base stats (cumulative)
     - Duration is decremented by 1
     - If duration ≤ 0, the effect is removed
   - Returns updated character with new base stats and effect list

5. **Stat Recalculation**: `StatCalculator.updateCharacterStats()` recalculates current stats:
   - Starts with `baseStats` (which may have been modified by per-turn modifiers)
   - Applies effect static modifiers from active effects
   - Stores result in `CharacterState.stats`
   - **Note**: Objects no longer have `statModifiers` directly - stat modifiers should be applied via effects

6. **Effect Source Removal**: After scene transitions, `ProximityEffectRemovalEffect` removes proximity effects from the scene being left

## Examples

### Example 1: Applying a Character Effect via Action

A scene choice that applies poison:

```json
{
  "id": "drink_potion",
  "text": "Drink the mysterious potion",
  "effects": {
    "addEffects": ["poison"]
  }
}
```

When this choice is selected:
1. `ActionEffects.addEffects` contains `["poison"]`
2. `CharacterEffectsEffect` calls `EffectManager.applyEffect(character, "poison")`
3. `EffectManager` looks up the built-in "poison" definition
4. Creates a `CharacterEffect` with `perTurnModifiers: { health: -1 }` and `duration: 5`
5. Adds it to `character.effects`
6. Each turn, `tickEffects()` reduces health by 1 and decrements duration
7. After 5 turns, the effect is automatically removed

### Example 2: Object with Carry Effects

An object that applies effects when picked up:

```json
{
  "id": "sword",
  "description": "A sharp sword",
  "weight": 1,
  "perception": 1,
  "removable": true,
  "traits": ["sharp", "sword"],
  "carryEffects": {
    "addEffects": ["strength_boost"]
  }
}
```

With the effect definition:
```json
{
  "id": "strength_boost",
  "name": "Strength Boost",
  "description": "You feel incredibly strong. Your muscles feel more powerful than usual.",
  "applicationDescription": "You feel somehow energized... A surge of power courses through your muscles.",
  "statModifiers": {
    "strength": 2,
    "agility": 1
  },
  "duration": 3
}
```

When the sword is picked up:
1. `carryEffects` are merged into the pickup action's resolution result
2. `EffectApplier` builds `effectSources` map: `{ "strength_boost": { type: 'carryEffect', objectId: 'sword' } }`
3. `CharacterEffectsEffect` applies the "strength_boost" character effect
4. Effect metadata is set: `{ sourceType: 'carryEffect', sourceObjectId: 'sword' }`
5. Log entries are created:
   - `'effect'` type: "You feel somehow energized... A surge of power courses through your muscles."
   - `'mechanic'` type: "Effect: Strength Boost (3 turns)"
6. Effect persists with +2 strength and +1 agility for 3 turns
7. **When sword is dropped**: The effect is automatically removed via `removeEffects` in the drop command

### Example 3: Temporary Stat Boost

A scene choice that temporarily boosts strength:

```json
{
  "id": "use_strength_potion",
  "text": "Drink the strength potion",
  "effects": {
    "addEffects": ["strength_boost"]
  }
}
```

With a game-specific effect definition:

```json
{
  "id": "strength_boost",
  "name": "Strength Boost",
  "description": "You feel incredibly strong.",
  "statModifiers": {
    "strength": 5
  },
  "duration": 3
}
```

This applies a +5 strength static modifier for 3 turns, then automatically expires.

### Example 4: Complex Action Effects

A command that combines multiple effect types:

```typescript
// In a command's resolve() method
return {
    outcome: 'success',
    narrativeResolver: 'You successfully complete the ritual.',
    effects: {
        stats: { health: 10 },           // Immediate health boost
        addTraits: ['blessed'],          // Add trait
        addFlags: ['ritual_complete'],   // Set world flag
        addItems: [{ id: 'holy_symbol', quantity: 1 }],  // Add item
        addEffects: ['regeneration']     // Apply character effect
    }
};
```

This single action:
- Increases health by 10 (immediate)
- Adds the "blessed" trait (persistent)
- Sets the "ritual_complete" world flag (persistent)
- Adds an item to inventory
- Applies a regeneration character effect (temporary, ticks each turn)

## Effect Source Tracking and Automatic Removal

The effects system automatically tracks and removes effects based on their source:

### carryEffects Removal

When an object with `carryEffects` is dropped:
- The drop command checks if the object has `carryEffects.addEffects`
- Those effect IDs are added to `removeEffects` in the action's `ActionEffects`
- `CharacterEffectsEffect` removes the effects automatically
- Effects are matched by ID, so only effects from that specific object are removed

### proximityEffect Removal

When leaving a scene:
- `ProximityEffectRemovalEffect` runs after scene transition
- Finds all effects with `metadata.sourceType === 'proximityEffect'` and `metadata.sourceSceneId` matching the scene being left
- Removes those effects via `EffectManager.removeEffect()`
- Log entries are created for removed effects

### Effect Types That Don't Need Removal

- **viewEffects**: One-time effects applied when looking at objects - not tracked or removed
- **detailedDescriptions.effects**: One-time effects from viewing detailed descriptions - not tracked or removed
- **Scene choice effects**: Permanent story progression - not removed

## Best Practices

1. **Use Character Effects for Persistent Conditions**: Use `EffectDefinition` for status effects that should persist over multiple turns (poison, buffs, debuffs, etc.)

2. **Use Action Effects for Immediate Changes**: Use `ActionEffects` for one-time state changes (stat adjustments, item additions, trait changes, etc.)

3. **Combine Both for Complex Effects**: Use `addEffects` in `ActionEffects` to apply character effects, allowing you to combine immediate changes with persistent effects

4. **Consider Stat Calculation Order**: Remember that per-turn modifiers modify base stats (cumulative), while static modifiers are applied during stat calculation (non-cumulative)

5. **Stat Modifiers on Effects, Not Objects**: Objects should NOT have `statModifiers` directly. Instead, create an effect definition with `statModifiers` and apply it via `carryEffects.addEffects` or `proximityEffect.addEffects`. This ensures proper tracking and automatic removal.

6. **Use Application Descriptions**: Add `applicationDescription` to effects to provide immediate narrative feedback when effects are applied, creating a more immersive experience.

7. **Effect Source Tracking**: Effects from `carryEffects` and `proximityEffect` are automatically tracked and removed when appropriate. You don't need to manually remove them unless you want custom behavior.

8. **Test Effect Interactions**: Multiple effects can stack; ensure combinations work as intended. Remember that effects with the same ID don't stack - applying the same effect again won't create a duplicate.

9. **Duration vs Source Removal**: Effects can be removed in two ways:
   - **Natural expiration**: Duration reaches 0 during `tickEffects()`
   - **Source removal**: Object dropped (carryEffects) or scene left (proximityEffect)
   - Source removal takes precedence - if an effect is removed by source, it won't expire naturally

