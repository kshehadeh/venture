# Scene & Choice JSON Schema

This document captures the validation rules for narrative content. It accompanies the machine-readable schema at `content/schemas/scene.schema.json` and should enable non-programmers to author scenes confidently.

## Schema overview

- **Scene**: defines the narrative node, title, and the list of available choices.
- **Choice**: captures player-facing text, optional requirements, effects, and the next scene transition.
- **Stat blocks**: support `health`, `willpower`, `perception`, and `reputation` keys; all are numeric. Effects use deltas (positive or negative), while requirements define minimum thresholds.
- **Identifiers**: `scene`, `choice`, trait, flag, and item ids must match `^[a-zA-Z0-9_-]+$` to keep file-friendly names. Scene and choice ids should be unique within their scope.
- **Collections**: arrays are `uniqueItems: true` to avoid duplicate flags, traits, or items.
- **Hidden consequences**: free-form strings that act as hooks for delayed or off-screen effects.

## Validation rules (high level)

- Scene must include `id`, `title`, `narrative`, and at least one `choice`.
- Each choice must include `id`, `text`, and `nextSceneId` (or `null` to end the narrative).
- Requirements may specify minimum stats, required traits/flags/items; absence means no restriction.
- Effects may adjust stats (deltas), add/remove traits, flags, or items, and specify hidden consequences.
- Inventory entries require `id` and `quantity` (integer ≥ 1).
- No additional properties are allowed beyond those defined in the schema.

## Machine-readable schema

The canonical schema lives at `content/schemas/scene.schema.json` and targets JSON Schema draft 2020-12. It is intended for use during content load to fail fast on invalid data.

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

## Usage guidance

1. Author scenes as JSON files and validate them with the schema before running the game.
2. Ensure `nextSceneId` references a real scene or `null` if it ends the storyline.
3. Use tags to organize content; keep ids short, lowercase, and descriptive.
4. Prefer small, composable scenes to ease testing and iteration.
