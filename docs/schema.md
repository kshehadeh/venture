# Scene & Choice JSON Schema

This document captures the validation rules for narrative content. It accompanies the machine-readable schema at `content/schemas/scene.schema.json` and should enable non-programmers to author scenes confidently.

## Schema overview

- **Scene**: defines the narrative node, title, the list of available choices, and optional objects.
- **Choice**: captures player-facing text, optional requirements, effects, and the next scene transition.
- **Object**: defines objects that can exist in scenes with attributes like weight, dimensions, perception requirements, effects, and container functionality.
- **Stat blocks**: support `health`, `willpower`, `perception`, `reputation`, and `strength` keys; all are numeric. Effects use deltas (positive or negative), while requirements define minimum thresholds.
- **Identifiers**: `scene`, `choice`, `object`, trait, flag, and item ids must match `^[a-zA-Z0-9_-]+$` to keep file-friendly names. Scene, choice, and object ids should be unique within their scope.
- **Collections**: arrays are `uniqueItems: true` to avoid duplicate flags, traits, or items.
- **Hidden consequences**: free-form strings that act as hooks for delayed or off-screen effects.

## Validation rules (high level)

- Scene must include `id`, `title`, `narrative`, and at least one `choice`. Objects are optional.
- Each choice must include `id`, `text`, and `nextSceneId` (or `null` to end the narrative).
- Each object must include `id`, `weight`, `perception`, `removable`, `description`, and `traits`.
- Requirements may specify minimum stats, required traits/flags/items; absence means no restriction.
- Effects may adjust stats (deltas), add/remove traits, flags, or items, and specify hidden consequences.
- Inventory entries require `id` and `quantity` (integer ≥ 1).
- Objects can have nested objects in `contains` array if they have the "container" trait.
- No additional properties are allowed beyond those defined in the schema.

## Machine-readable schema

The canonical schema lives at `content/schemas/scene.schema.json` and targets JSON Schema draft 2020-12. It is intended for use during content load to fail fast on invalid data.

## Object Definition

Objects are defined in the `objects` array of a scene. Each object has:

- **Required fields**: `id`, `weight`, `perception`, `removable`, `description`, `traits`
- **Optional fields**: `quantity` (defaults to 1), `carryEffects`, `viewEffects`, `proximityEffect`, `contains` (for containers), `maxWeight`, `width`, `height`, `depth`
- **Traits**: Array of strings. Special traits include "container" (enables container functionality) and "strength_X" (adds X to character strength).
- **Effects**: Objects can have three types of effects:
  - `carryEffects`: Applied when the object is picked up
  - `viewEffects`: Applied when the object is looked at
  - `proximityEffect`: Applied when the character is in the scene with the object

## Examples

### Minimal scene

```json
{
  "id": "lonely-road",
  "title": "The Lonely Road",
  "narrative": "A gravel path stretches into the fog.",
  "choices": [
    {
      "id": "continue",
      "text": "Keep walking.",
      "nextSceneId": "fork"
    }
  ]
}
```

### Scene with requirements and effects

```json
{
  "id": "intro",
  "title": "Waking in the Gloam",
  "narrative": "You wake to the sound of distant thunder. The air is damp and the ground cold beneath your palms.",
  "tags": ["prologue", "dream"],
  "choices": [
    {
      "id": "stand",
      "text": "Stand and steady yourself.",
      "effects": {
        "stats": { "willpower": 1 },
        "addFlags": ["awoken"]
      },
      "nextSceneId": "crossroads"
    },
    {
      "id": "linger",
      "text": "Linger and listen to the storm.",
      "requirements": {
        "stats": { "perception": 1 }
      },
      "effects": {
        "addTraits": ["storm_touched"],
        "hiddenConsequences": ["storm_whispers"]
      },
      "nextSceneId": "crossroads"
    }
  ]
}
```

### Scene with objects

```json
{
  "id": "abandoned-camp",
  "title": "Abandoned Camp",
  "narrative": "You find an abandoned campsite. A weathered backpack lies near the fire pit.",
  "objects": [
    {
      "id": "weathered-backpack",
      "weight": 2,
      "perception": 1,
      "removable": true,
      "description": "A weathered leather backpack with several pockets.",
      "traits": ["container", "strength_3"],
      "maxWeight": 20,
      "width": 30,
      "height": 40,
      "depth": 15,
      "carryEffects": {
        "stats": {
          "strength": 3
        }
      },
      "contains": [
        {
          "id": "rusty-knife",
          "weight": 0.5,
          "perception": 2,
          "removable": true,
          "description": "A rusty but serviceable knife.",
          "traits": ["weapon"]
        }
      ]
    },
    {
      "id": "ancient-scroll",
      "weight": 0.1,
      "perception": 5,
      "removable": true,
      "description": "An ancient scroll with faded writing.",
      "traits": ["readable"],
      "viewEffects": {
        "addTraits": ["learned"]
      }
    }
  ],
  "choices": [
    {
      "id": "leave",
      "text": "Leave the campsite",
      "nextSceneId": "forest"
    }
  ]
}
```

## Usage guidance

1. Author scenes as JSON files and validate them with the schema before running the game.
2. Ensure `nextSceneId` references a real scene or `null` if it ends the storyline.
3. Use tags to organize content; keep ids short, lowercase, and descriptive.
4. Prefer small, composable scenes to ease testing and iteration.
5. When defining objects:
   - Set `perception` based on how hidden/obvious the object should be (lower = more obvious).
   - Use `removable: false` for objects that are part of the scene (e.g., furniture, fixed structures).
   - For containers, set `maxWeight` and dimensions (`width`, `height`, `depth`) to define capacity.
   - Use strength traits (e.g., "strength_5") on containers to increase carrying capacity.
   - Nest objects in `contains` array for containers that start with items inside.
