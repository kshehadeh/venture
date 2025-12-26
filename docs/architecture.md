# Venture TUI Game: Technical Plan

This document lays out an implementable plan for a text-based, turn-based TUI game that blends choose-your-own-adventure narratives, classic interactive fiction, and lightweight RPG mechanics. The plan favors clarity, modularity, and data-driven content.

## High-level architecture overview

```
+--------------------------+
|        TUI Layer         |  (Ink or similar TUI lib)
|  - Multi-pane layout     |
|  - Input handling        |
+------------+-------------+
             |
             v
+--------------------------+
|      Game Engine         |
|  - Game loop             |
|  - State transitions     |
|  - Validation & effects  |
+------------+-------------+
             |
             v
+--------------------------+
|      Systems Layer       |
|  - Character system      |
|  - World state           |
|  - Scene & choice logic  |
+------------+-------------+
             |
             v
+--------------------------+
|   Data & Content Layer   |
|  - Scene definitions     |
|  - Config & assets       |
|  - Schema validation     |
+--------------------------+
```

## Engine and UI separation

- **Headless game engine**: owns the game loop, state transitions, validation, and effect application. It exposes a pure, serializable `GameState` and accepts simple inputs (choice selections, restart/quit signals).
- **UI adapters**: render-only surfaces (TUI now, other shells later) that:
  - Subscribe to engine state snapshots.
  - Render panes and collect user input.
  - Forward normalized inputs (e.g., `{ type: "choice", choiceId: "stand" }`) back to the engine.
- **No rendering in the engine**: the engine produces structured render data (current scene, choices with availability, stats, log) without formatting or ANSI codes.
- **Pluggable shells**: the TUI is the first adapter; future adapters (web, GUI, tests) can reuse the same engine contract.
- **Serialization boundary**: the engine should be able to run deterministically with plain JSON inputs/outputs, enabling headless tests and replay.

## Turn-based loop focus areas

- **Phase order**: input -> validation -> initiative/order -> resolution -> world updates -> end-of-turn checks.
- **Determinism**: use seeded RNG per session/turn to allow replays and tests.
- **Structured intents**: UIs submit normalized intents (choice selection, targeted action, item use) without embedding UI concerns.
- **Outcome logs**: engine emits structured events for UIs to render; no formatting or ANSI codes at the engine layer.
- **NPC policy**: AI/policy produces intents using stats/traits/flags; the same validation/resolution pipeline processes them.

## Core data models (TypeScript-style pseudo types)

```ts
// Character, inventory, and traits
interface StatBlock {
  health: number;
  willpower: number;
  perception: number;
  reputation: number;
}

type TraitId = string;

type ItemId = string;

interface InventoryEntry {
  id: ItemId;
  quantity: number;
}

interface CharacterState {
  stats: StatBlock;
  traits: Set<TraitId>;
  inventory: InventoryEntry[];
}

// World & progression
interface WorldState {
  globalFlags: Set<string>;
  visitedScenes: Set<string>;
  turn: number;
}

// Scene & choice definitions
interface ChoiceRequirement {
  stats?: Partial<StatBlock>;
  traits?: TraitId[];
  flags?: string[];
  items?: ItemId[];
}

interface ChoiceEffect {
  stats?: Partial<Record<keyof StatBlock, number>>; // deltas
  addTraits?: TraitId[];
  removeTraits?: TraitId[];
  addFlags?: string[];
  removeFlags?: string[];
  addItems?: InventoryEntry[];
  removeItems?: InventoryEntry[];
  hiddenConsequences?: string[]; // descriptive hooks for delayed effects
}

interface ChoiceDefinition {
  id: string;
  text: string;
  requirements?: ChoiceRequirement;
  effects?: ChoiceEffect;
  nextSceneId: string | null; // null => end/epilogue
}

interface SceneDefinition {
  id: string;
  title: string;
  narrative: string;
  tags?: string[];
  choices: ChoiceDefinition[];
}

// Aggregated game state
interface GameState {
  character: CharacterState;
  world: WorldState;
  currentSceneId: string;
  log: string[];
}
```

## Scene and choice schema examples

Example JSON definition (`content/examples/intro.scene.json`):

```json
{
  "id": "intro",
  "title": "Waking in the Gloam",
  "narrative": "You wake to the sound of distant thunder...",
  "tags": ["prologue", "dream"],
  "choices": [
    {
      "id": "stand",
      "text": "Stand and steady yourself.",
      "effects": {
        "stats": {"willpower": +1},
        "addFlags": ["awoken"]
      },
      "nextSceneId": "crossroads"
    },
    {
      "id": "linger",
      "text": "Linger and listen to the storm.",
      "requirements": {
        "stats": {"perception": 1}
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

Validation approach (planned):
- Use JSON schema (or Zod) to validate scene files at load time.
- Validate cross-references (e.g., `nextSceneId` exists) during content load.

## Game loop breakdown

1. Load config and all scene definitions; validate schemas and cross-links.
2. Initialize game state (character, world, starting scene, log).
3. Render current scene and layout panes (story, choices, stats, log).
4. Accept keyboard input; map to chosen `ChoiceDefinition`.
5. Validate choice requirements against current state; if invalid, show feedback and re-prompt.
6. Apply choice effects (stats, traits, flags, inventory); log events.
7. Transition to the next scene and increment turn; mark visited scenes.
8. Repeat until `nextSceneId` is null or a failure state is reached.
9. Offer restart/quit hooks.

## TUI layout strategy

- Assume **Ink** (React-like, Bun-compatible) for rendering and keyboard handling.
- Layout panes:
  - **Story pane**: current scene narrative and title.
  - **Choices pane**: numbered list; unavailable choices visibly dimmed/annotated.
  - **Character pane**: stats, traits, key inventory items.
  - **Event log pane**: recent effects and narrative beats.
- Input handling:
  - Listen to keypress (numbers/letters) mapped to choice ids.
  - Graceful handling for invalid input; prompt again without crashing the loop.
- Rendering:
  - Efficient redraw: only update panes whose data changed.
  - Clear separators and color accents for readability.

## Step-by-step implementation roadmap

1. **Content loading & validation**
   - Define schemas (JSON Schema or Zod) for scenes and choices.
   - Implement loader that reads all scenes from a content directory and validates them.
2. **Core data structures**
   - Implement `GameState`, `CharacterState`, `WorldState`, and helpers for stat bounds and failure states.
3. **Choice evaluation**
   - Build requirement checking and effect application functions (pure, testable).
   - Handle hidden consequences as queued log entries or deferred effects.
4. **Game loop scaffold**
   - Create deterministic update cycle: render -> input -> validate -> apply -> transition.
   - Add logging utilities for state changes.
5. **TUI shell**
   - Set up Ink app with panes and input handling.
   - Wire state updates from the game loop to the UI renderer.
6. **Vertical slice content**
   - Author a small scene chain (intro -> crossroads -> outcome) as JSON.
   - Ensure unavailable choices render distinctly.
7. **Persistence hooks (optional)**
   - Abstract state serialization for future save/load without implementing storage yet.
8. **Testing**
   - Unit tests for requirement validation and effect application.
   - Schema validation tests for sample content.

## Risks and tradeoffs

- **Registry availability**: External package installs (e.g., Ink, schema libs) may be blocked; mitigate by stubbing interfaces and deferring installs when offline.
- **Schema complexity vs. authoring ease**: Overly strict schemas can burden writers; prefer progressive validation with clear error messages.
- **TUI performance**: Excessive redraws can flicker; design incremental renders and avoid unnecessary state churn.
- **Content coupling**: Hardcoded scene ids in code risk drift; enforce cross-link validation during load.

## Recommended scope for an initial vertical slice

- 3–5 scenes defined purely in JSON using the schema above.
- Single character with 3–4 stats and a small inventory.
- Basic requirement checks (stats, flags, traits) and stat deltas.
- TUI layout with story, choices, and stats panes; event log can be a simple scrolling list.
- End condition via `nextSceneId: null` or reaching zero health/willpower (failure state).

## Assumptions

- **TUI library**: Ink (React-based), expected to run under Bun via Node compatibility.
- **Storage**: Local filesystem for content loading.
- **Persistence**: In-memory only for now, with future save/load hooks.
