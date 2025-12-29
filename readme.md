# Venture

A text-based, turn-based Transactional UI (TUI) game engine built with **Bun**, **TypeScript**, and **React** (via **Ink**). The project is structured as a **monorepo** with separate packages for the engine, TUI, and editor.

## Quick Start

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Run the TUI application**:
   ```bash
   bun run dev
   ```
   
   Or with a specific game:
   ```bash
   bun run dev -- --game demo
   ```

3. **Use the editor CLI** to create and validate games:
   ```bash
   bun run packages/editor/src/cli.ts new-game mygame
   bun run packages/editor/src/cli.ts validate mygame
   ```

4. **Type-check the code**:
   ```bash
   bun run typecheck
   ```

## Monorepo Structure

This project uses **Bun workspaces** to manage multiple packages:

### `packages/engine/` - Headless Game Engine
The core game engine package (`@venture/engine`) contains all game logic and is completely UI-agnostic.

**Exports**:
- `GameEngine` class - Main API for running games
- All TypeScript types (`GameState`, `SceneDefinition`, `ObjectDefinition`, etc.)
- Validation utilities
- Content loader functions
- JSON schemas for game content

**Documentation**: See `packages/engine/docs/` for detailed engine documentation:
- `engine.md` - Turn structure, character model, action resolution
- `effects.md` - Effects system documentation
- `inventory-and-objects.md` - Objects and inventory management

**Dependencies**: No UI dependencies (zod, ai SDK, etc.)

### `packages/tui/` - Terminal UI Application
The TUI package (`@venture/tui`) provides the Ink/React-based terminal interface.

**Features**:
- React components for game display
- Input handling
- Save/load UI
- Game selection

**Dependencies**: 
- `@venture/engine` (workspace dependency)
- React, Ink, and other UI dependencies

**Entry Point**: `packages/tui/src/main.tsx`

### `packages/editor/` - CLI Editor
The editor package (`@venture/editor`) provides tools for creating and validating game content.

**Commands**:
- `new-game <gameId>` - Create new game structure
- `new-scene <gameId> <sceneId>` - Create new scene file
- `validate <gameId>` - Validate all game files
- `validate-scene <path>` - Validate single scene file

**Dependencies**:
- `@venture/engine` (workspace dependency)
- CLI framework (commander, prompts)

## Shared Directories

These directories are shared across all packages and remain at the root:

- **`games/`** - Game content. Each game is a subdirectory (e.g., `games/demo/`)
  - `game.json` - Game manifest (ID, name, entry scene)
  - `scenes/*.scene.json` - Scene definitions
  - `effects.json` - Optional game-specific effect definitions

- **`saves/`** - Saved game states. Each save is a folder (e.g., `saves/demo_123456/`)
  - `snapshot.json` - Complete `GameState`
  - `metadata.json` - Save details (turn, timestamp)
  - `history.jsonl` - Action history for replays

- **`tests/`** - Test files (may be restructured per package in the future)

## Documentation

- **`docs/architecture.md`** - High-level architecture and system design
- **`AGENTS.md`** - Context for AI agents working with this codebase
- **`packages/engine/docs/`** - Engine-specific documentation
  - `engine.md` - Engine internals and turn processing
  - `effects.md` - Effects system
  - `inventory-and-objects.md` - Objects and inventory
- **`packages/engine/schemas/`** - JSON schemas for game content validation

## Development

### Workspace Scripts

- `bun run dev` - Run the TUI application
- `bun run build` - Build all packages
- `bun run typecheck` - Type-check all packages
- `bun run lint` - Lint all packages
- `bun run test` - Run tests for all packages

### Package-Specific Scripts

Each package has its own scripts defined in its `package.json`. You can run them with:

```bash
bun run --filter @venture/engine typecheck
bun run --filter @venture/tui dev
bun run --filter @venture/editor <command>
```

## Philosophy

1. **Separation of Concerns**: The engine manages state, validation, and logic. The UI is a renderer that sends commands to the core.
2. **Data-Driven**: Content is defined in JSON files (`game.json`, `*.scene.json`) under the `games/` directory.
3. **Determinism**: Game state is serializable. Replays are possible by re-running the `actionHistory`.
4. **UI-Agnostic Engine**: The engine can be used with any UI (TUI, web, etc.) without modification.
