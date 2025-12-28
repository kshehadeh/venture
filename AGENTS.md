# Context for AI Agents

This document provides a high-level overview of the **Venture** TUI game engine architecture to help LLMs understand the codebase quickly.

## Coding Standards

### File Naming
- **All files must use kebab-case**: Use lowercase letters with hyphens as separators (e.g., `game-engine.ts`, `command-parser.ts`, `narrative-panel.tsx`)
- **Exceptions**: React component files may use PascalCase for the component name, but the file itself should still be kebab-case (e.g., `game-selector.tsx` contains `GameSelector` component)
- **Examples**:
  - ✅ `game-engine.ts`, `command-parser.ts`, `narrative-panel.tsx`
  - ❌ `gameEngine.ts`, `commandParser.ts`, `NarrativePanel.tsx`

### Code Style
- Use TypeScript with strict typing
- Prefer functional programming patterns where appropriate
- Keep functions pure when possible (no side effects)
- Use async/await for asynchronous operations

## Project Overview

**Venture** is a text-based, turn-based Transactional UI (TUI) game engine built with **Bun**, **TypeScript**, and **React** (via **OpenTUI**). It separates the game engine logic (headless) from the UI visualization.

### Core Philosophy
1.  **Separation of Concerns**: The `Engine` (`src/core`) manages state, validation, and logic. The `UI` (`src/ui`) is a dumb renderer that sends standardized commands to the core.
2.  **Data-Driven**: Content is defined in JSON files (`game.json`, `*.scene.json`) under the `games/` directory.
3.  **Determinism**: Game state is serializable. Replays are possible by re-running the `actionHistory`.

## Directory Structure

-   `games/`: Content root. Each game is a subdirectory (e.g., `games/demo/`).
    -   `game.json`: Manifest (ID, name, entry scene).
    -   `scenes/`: Folder containing `*.scene.json` files.
-   `saves/`: Saved games. Each save is a folder (e.g., `saves/demo_123456/`).
    -   `snapshot.json`: Complete `GameState`.
    -   `metadata.json`: Save details (turn, timestamp).
    -   `history.jsonl`: Action history for replays.
-   `src/core/`: Headless game logic.
    -   `engine.ts`: Main loop (`processTurn`), `SceneContext`.
    -   `command.ts`: Command string parsing (`parseCommand`), alias matching.
    -   `resolution.ts`: Action effects and state updates.
    -   `save.ts`: Save/Load service.
    -   `loader.ts`: Content loading from `games/`.
    -   `globals.ts`: **Engine-level** global actions (e.g., `look`, `inventory`).
-   `src/ui/`: TUI implementation (OpenTUI/React).
    -   `App.tsx`: Main application controller. Handles mode switching (loading, playing).
    -   `Layout.tsx`: The main game UI (Narrative, Choices, Stats, Input).

## Key Systems

### 1. Command Pipeline
Raw user input flows from `App.tsx` -> `src/core/command.ts`.

1.  **Input**: User types "i", "inv", "inventory", "1", "pick up sword", etc.
2.  **Parsing (`parseCommand`)**:
    -   **Pickup Commands**: Commands like "pick up sword" or "grab backpack" are parsed first to extract object names and create pickup `ActionIntent`s.
    -   **Context Merging**: Combines **Scene Choices** + **Game Global Actions** (from `game.json`) + **Engine Global Actions** (from `globals.ts`).
    -   **Index Match**: `1` maps to the first *Scene Choice*.
    -   **Alias/ID Match**: Checks `id` and `aliases` defined in `ChoiceDefinition`.
    -   **NLP Fallback**: Uses LLM (`classifyCommand`) if no direct match found.
3.  **Execution**: Returns an `ActionIntent` which `App.tsx` passes to the engine. Action types include `'choice'`, `'use_item'`, and `'pickup'`.

### 2. Global Actions
Actions available in every scene are defined in two places:
-   **Engine Level (`src/core/globals.ts`)**: Built-in commands like `look`, `inventory` (`items`), `pickup` (aliases: "pick up", "grab", "take", "get").
-   **Game Level (`game.json`)**: Custom globals specific to a game module.

### 3. Objects System
Objects can exist in scenes and be picked up by players:

-   **Object Attributes**: Each object has `id`, `weight`, `perception` (visibility requirement), `removable`, `description`, `traits`, and optional dimensions.
-   **Perception System**: Objects with `perception` > character's `perception` stat are not visible. Filtered via `getVisibleObjects()`.
-   **Pickup Action**: The "pickup" global action allows picking up objects by name (e.g., "pick up sword").
-   **Carrying Capacity**: Based on character's `strength` stat (capacity = strength × 10). Containers with strength traits add to effective strength.
-   **Hand-Held Items**: Characters can hold up to 2 items in hands. Containers don't use hand-held slots.
-   **Container System**: Objects with "container" trait can hold other objects, subject to weight and dimensional constraints.
-   **Object Effects**: Objects can have `carryEffects` (when picked up), `viewEffects` (when looked at), and `proximityEffect` (when in scene).

### 4. Save System
Saves are folder-based for resilience and replayability.
-   **Snapshot**: JSON dump of `GameState`. **Important**: Sets are serialized as `{ $type: 'Set', value: [...] }` via a custom replacer/reviver.
-   **History**: Line-delimited JSON of every `ActionIntent` taken.

## Data Models

### `GameState`
The single source of truth.
```typescript
interface GameState {
    character: CharacterState; // Stats, Inventory, Traits, Hand-held items
    world: WorldState;         // Global flags, Visited scenes, Turn count
    currentSceneId: string;
    log: LogEntry[];           // Turn-by-turn log
    actionHistory: ActionIntent[];
    sceneObjects: Record<SceneId, ObjectDefinition[]>; // Objects in each scene
}
```

### `SceneDefinition`
```typescript
interface SceneDefinition {
    id: string;
    narrative: string;
    choices: ChoiceDefinition[];
    objects?: ObjectDefinition[]; // Objects in the scene
}
```

### `ObjectDefinition`
Objects that can exist in scenes and be picked up:
```typescript
interface ObjectDefinition {
    id: string;
    quantity?: number; // Defaults to 1
    weight: number;
    perception: number; // Minimum perception to notice
    removable: boolean; // Whether it can be picked up
    description: string;
    traits: string[]; // Array of trait strings
    carryEffects?: ActionEffects; // Effects when picked up
    viewEffects?: ActionEffects; // Effects when looked at
    proximityEffect?: ActionEffects; // Effects when in scene
    contains?: ObjectDefinition[]; // Nested objects (if container)
    maxWeight?: number; // Max weight for containers
    width?: number; // Width dimension
    height?: number; // Height dimension
    depth?: number; // Depth dimension
}
```
