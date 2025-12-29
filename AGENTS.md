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
- When adding functionality where entities need to be encapsulated, prefer class-based patterns to keep related code self contained with protected data behind mutators and accessors.
- Always keep view code separate from engine/logic.  We want the ability to use a different UI in the future.  

## Project Overview

**Venture** is a text-based, turn-based Transactional UI (TUI) game engine built with **Bun**, **TypeScript**, and **React** (via **Ink**). It separates the game engine logic (headless) from the UI visualization.

### Core Philosophy
1.  **Separation of Concerns**: The `Engine` (`src/core`) manages state, validation, and logic. The `UI` (`src/ui`) is a dumb renderer that sends standardized commands to the core.
2.  **Data-Driven**: Content is defined in JSON files (`game.json`, `*.scene.json`) under the `games/` directory.
3.  **Determinism**: Game state is serializable. Replays are possible by re-running the `actionHistory`.

## Monorepo Structure

This project is organized as a Bun workspaces monorepo with three packages:

### `packages/engine/` - Headless Game Engine
The engine package contains all core game logic and is UI-agnostic:
-   `src/engine.ts`: Main loop (`processTurn`), `SceneContext`.
-   `src/command.ts`: Command string parsing (`parseCommand`), alias matching.
-   `src/resolution.ts`: Action effects and state updates.
-   `src/save.ts`: Save/Load service.
-   `src/loader.ts`: Content loading from `games/`.
-   `src/globals.ts`: **Engine-level** global actions (e.g., `look`, `inventory`).
-   `src/types.ts`: All TypeScript type definitions.
-   `src/index.ts`: Public API exports (GameEngine, types, utilities).
-   `schemas/`: JSON schemas for game content validation.

**Exports**: The engine package exports `GameEngine`, all types, validation utilities, loader functions, and schemas via `@venture/engine`.

### `packages/tui/` - Terminal UI Application
The TUI package provides the Ink/React-based terminal interface:
-   `src/main.tsx`: Entry point for the TUI application.
-   `src/ui/App.tsx`: Main application controller. Handles mode switching (loading, playing).
-   `src/ui/Layout.tsx`: The main game UI (Narrative, Choices, Stats, Input).
-   `src/ui/components/`: React components for UI rendering.

**Dependencies**: Imports from `@venture/engine` for all game logic and types.

### `packages/editor/` - CLI Editor
The editor package provides tools for creating and validating game content:
-   `src/cli.ts`: CLI entry point with commands:
    -   `new-game <gameId>`: Create new game structure
    -   `new-scene <gameId> <sceneId>`: Create new scene file
    -   `validate <gameId>`: Validate all game files
    -   `validate-scene <path>`: Validate single scene file

**Dependencies**: Imports from `@venture/engine` for types and validation.

### Shared Directories (at root)
-   `games/`: Content root. Each game is a subdirectory (e.g., `games/demo/`).
    -   `game.json`: Manifest (ID, name, entry scene).
    -   `scenes/`: Folder containing `*.scene.json` files.
-   `saves/`: Saved games. Each save is a folder (e.g., `saves/demo_123456/`).
    -   `snapshot.json`: Complete `GameState`.
    -   `metadata.json`: Save details (turn, timestamp).
    -   `history.jsonl`: Action history for replays.

## Key Systems

### 1. Command Pipeline
Raw user input flows from `App.tsx` -> `src/core/command.ts`.

1.  **Input**: User types "i", "inv", "inventory", "pick up sword", etc.
2.  **Parsing (`parseCommand`)**:
    -   **Command Processing**: Uses a plugin-based `CommandProcessor` system with multiple processors:
        -   **ProceduralProcessor** (Priority 1): Fast pattern matching for common commands (pickup, look, move, etc.)
        -   **AIProcessor** (Priority 2): LLM-based fallback for ambiguous or complex commands
    -   **Context Merging**: Combines **Game Global Actions** (from `game.json`) + **Engine Global Actions** (from `globals.ts`).
    -   **Alias/ID Match**: Checks command IDs and aliases from `ENGINE_GLOBAL_ACTIONS` and game globals.
    -   **NLP Fallback**: Uses LLM to extract command ID and parameters if no direct match found.
3.  **Command Execution**: Normalized command input is passed to the appropriate `Command` class:
    -   Each command implements the `Command` interface with `execute()` and `resolve()` methods
    -   `execute()` creates an `ActionIntent` with `type` set to the command ID (e.g., `'look'`, `'pickup'`, `'move'`)
4.  **Command Identification**: The engine uses `CommandRegistry.findCommand()` which:
    -   Iterates through all registered commands
    -   Calls `matchesIntent()` on each command to find the one that handles the intent
    -   Returns the matching command or null if no command matches

### 2. Command System
All actions operate through commands registered in the `CommandRegistry`. There are no scene choices - everything is a command.

-   **Command Registry**: Commands are registered in `CommandRegistry` and implement the `Command` interface:
    -   `getCommandId()`: Returns the command ID (e.g., `'look'`, `'pickup'`, `'move'`)
    -   `matchesIntent(intent)`: Returns true if this command handles the given `ActionIntent`
    -   `execute(input, context)`: Creates an `ActionIntent` from normalized input
    -   `resolve(state, intent, context)`: Produces `ResolutionResult` with narrative and effects
-   **Engine Commands**: Built-in commands available everywhere:
    -   `look`: Display scene narrative, visible objects, and visible exits (aliases: "search", "l")
    -   `items`: List inventory with container information (aliases: "inventory", "inv", "i")
    -   `pickup`: Pick up objects from scenes (aliases: "pick up", "grab", "take", "get")
    -   `move`: Move between scenes via exits (aliases: "go", "walk", "travel")
    -   `transfer`: Transfer items between containers (aliases: "switch", "move")
    -   `effects`: Display active effects on character (aliases: "status", "conditions", "affects")
    -   `help`: Display help information
-   **ActionIntent Type**: The `type` field in `ActionIntent` is a string that must match a command ID from the registry. There is no `ActionType` union type - commands are identified by their string ID.

### 3. Objects System
Objects can exist in scenes and be picked up by players:

-   **Object Attributes**: Each object has `id`, `weight`, `perception` (visibility requirement), `removable`, `description`, `traits`, and optional dimensions.
-   **Perception System**: Objects with `perception` > character's `perception` stat are not visible. Filtered via `getVisibleObjects()`.
-   **Pickup Action**: The "pickup" global action allows picking up objects by name (e.g., "pick up sword").
-   **Carrying Capacity**: Based on character's `strength` stat (capacity = strength × 10). Containers with strength traits add to effective strength.
-   **Hand-Held Items**: Characters can hold up to 2 items in hands. Each hand has 5 ring slots (for small items like rings) and general storage. Containers don't use hand-held slots.
-   **Container System**: Objects with "container" trait can hold other objects, subject to weight and dimensional constraints.
-   **Container Slots**: Containers can have named slots, each of which can hold exactly one item. Slots have their own weight and dimensional constraints (`maxWeight`, `width`, `height`, `depth`). Items in slots are displayed separately from general container storage when looking at containers or viewing inventory. Items can be transferred to specific slots using the transfer command (e.g., "put sword in backpack sheath slot").
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
    contains?: ObjectDefinition[]; // Nested objects (if container) - general storage
    slots?: SlotDefinition[]; // Named slots that can each hold exactly one item
    maxWeight?: number; // Max weight for containers
    width?: number; // Width dimension
    height?: number; // Height dimension
    depth?: number; // Depth dimension
}

interface SlotDefinition {
    id: string; // Unique identifier within the container
    name?: string; // Display name (optional, defaults to id)
    maxWeight?: number; // Maximum weight capacity for this slot
    width?: number; // Width dimension constraint
    height?: number; // Height dimension constraint
    depth?: number; // Depth dimension constraint
    itemId: string | null; // ID of the item currently in the slot, or null if empty
}
```
