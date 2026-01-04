# Context for AI Agents

This document provides a high-level overview of the **Venture** TUI game engine to help LLMs and humans understand the codebase quickly.

## Coding Standards

### File Naming
- **All files must use kebab-case**: Use lowercase letters with hyphens as separators (e.g., `game-engine.ts`, `command-parser.ts`, `narrative-panel.tsx`)
- **Exceptions**: React component files may use PascalCase for the component name, but the file itself should still be kebab-case (e.g., `game-selector.tsx` contains `GameSelector` component)
- **Examples**:
  - ✅ `game-engine.ts`, `command-parser.ts`, `narrative-panel.tsx`
  - ❌ `gameEngine.ts`, `commandParser.ts`, `NarrativePanel.tsx`

### Code Style
- Use TypeScript with strict typing
- Prefer functional patterns when appropriate
- Keep functions pure when possible (no side effects)
- Use async/await for asynchronous operations
- When adding encapsulated entities, prefer class-based patterns with protected state and mutators/accessors
- Always keep view code separate from engine/logic

## Project Overview

**Venture** is a text-based, turn-based TUI game engine built with **Bun**, **TypeScript**, and **React** (via **OpenTUI**). The engine is headless and UI-agnostic, with the TUI as one consumer.

### Core Philosophy
1. **Separation of Concerns**: The engine manages state, validation, and logic. The UI is a renderer that sends standardized commands to the core.
2. **Data-Driven**: Content is defined in JSON files under `games/` and loaded at runtime.
3. **Determinism**: Game state is serializable; replays are possible by re-running `actionHistory`.

## Monorepo Structure

This project is organized as a Bun workspaces monorepo with three packages:

### `packages/engine/` - Headless Game Engine
Core game logic, fully UI-agnostic:
- `src/game-engine.ts`: `GameEngine` class (load game, process input, expose `GameView`)
- `src/engine.ts`: `processTurn`, `SceneContext`, perception filtering
- `src/command.ts`: `parseCommand` + command registry access
- `src/command-processor.ts`: Plugin pipeline for parsing input
- `src/processors/`: `procedural-processor.ts` and `ai-processor.ts`
- `src/commands/`: Built-in command classes (look, items, pickup, move, talk, etc.)
- `src/llm.ts`: LLM helpers for classification, Q&A, and NPC dialogue
- `src/loader.ts`: Loads `games/` content and resolves `#file` references
- `src/save.ts`: Save/load utilities and serializers
- `src/game-state.ts`, `src/character-state.ts`, `src/world-state.ts`: State classes
- `src/types.ts`: Shared type definitions
- `schemas/`: JSON schemas for validation

**Exports**: The engine exports `GameEngine`, types, loader/validation utilities, and schemas via `@venture/engine`.

### `packages/tui/` - Terminal UI Application
OpenTUI-based interface:
- `src/main.tsx`: Entry point and CLI arg parsing
- `src/ui/App.tsx`: Application controller, modes, save/load hooks
- `src/ui/Layout.tsx`: Main layout (narrative, input, stats, etc.)
- `src/ui/components/`: UI components

**Dependencies**: `@venture/engine`, `@opentui/core`, `@opentui/react`.

### `packages/editor/` - CLI Editor
Content creation and validation tools:
- `src/cli.ts`: `new-game`, `new-scene`, `validate`, `validate-scene`

**Dependencies**: `@venture/engine`, `commander`, `prompts`.

### Shared Directories (root)
- `games/`: Content root. Each game is a folder (`games/<gameId>/`).
  - `game.json`: Manifest (id, name, description, entry scene)
  - `scenes/<sceneId>/scene.json`: Scene definition per folder
  - Optional: `effects.json` with effect definitions
  - File references: any string starting with `#` in a scene JSON is loaded from a file in the same scene folder (e.g., `"narrative": "#narrative.md"`).
- `saves/`: Save folders (`saves/<gameId>_<timestamp>/`) with `snapshot.json`, `metadata.json`, `history.jsonl`.

## Key Systems

### 1. Command Pipeline
Raw input flows `GameEngine.processInput` → `parseCommand` → `CommandProcessor`.

- **Processors**:
  - `ProceduralProcessor` (priority 1): deterministic parsing for common commands
  - `AIProcessor` (priority 2): OpenAI-backed fallback for ambiguous input
- **LLM integration**: `src/llm.ts` uses `@ai-sdk/openai` (requires `OPENAI_API_KEY`). It classifies commands, extracts parameters, answers questions, and powers NPC dialogue.
- **Conversation context**: when in a conversation, input defaults to a `talk` message unless an `exit-conversation` or `talk <npc>` command is detected.
- **ActionIntent**: `intent.type` is a string command ID (no union type).

### 2. Command System
All actions are commands registered in `CommandRegistry` (`src/commands/command-registry.ts`). Built-in commands:
- `look`, `items`, `pickup`, `drop`, `move`, `transfer`, `help`, `effects`, `query`, `talk`, `set-state`, `exit-conversation`

Aliases are defined in `src/globals.ts` and merged with game-specific actions.

### 3. Objects and Inventory
- Objects are `GameObject` instances with perception gating and optional states.
- Containers support general storage and named slots with independent constraints.
- Hand containers are created at game start to model 2 hands + ring slots.
- `set-state` enables stateful objects (e.g., on/off) with `StateDefinition` effects.

### 4. Save System
`save.ts` serializes Sets and `GameObject` instances using a `$type` wrapper and reconstructs class instances on load.

## Data Models (Selected)

### `GameState` (class)
```typescript
class GameState {
    characters: Record<string, CharacterState>;
    world: WorldState;
    currentSceneId: string;
    log: LogEntry[];
    rngSeed: number;
    actionHistory: ActionIntent[];
    sceneObjects: Record<SceneId, GameObject[]>;
    effectDefinitions?: Record<string, EffectDefinition>;
    objectStates: Record<string, string>;
    conversationHistory: Record<string, Array<{ user: string; assistant: string }>>;
    currentContext: GameContext;
}
```

### `SceneDefinition`
```typescript
interface SceneDefinition {
    id: string;
    narrative: string;
    objects?: ObjectDefinition[];
    exits?: ExitDefinition[];
    npcs?: NPCDefinition[];
    detailedDescriptions?: DetailedDescription[];
}
```

### `ObjectDefinition`
```typescript
interface ObjectDefinition {
    id: string;
    quantity?: number;
    weight: number;
    perception: number;
    removable: boolean;
    description: string;
    traits: string[];
    carryEffects?: ActionEffects;
    viewEffects?: ActionEffects;
    proximityEffect?: ActionEffects;
    contains?: ObjectDefinition[];
    slots?: SlotDefinition[];
    maxWeight?: number;
    maxItems?: number;
    width?: number;
    height?: number;
    depth?: number;
    detailedDescriptions?: DetailedDescription[];
    states?: StateDefinition[];
    defaultState?: string;
}
```
