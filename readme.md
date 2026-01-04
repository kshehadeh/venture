# Venture

Venture is a text-based, turn-based Transactional UI (TUI) game engine built with **Bun**, **TypeScript**, and **React** (via **OpenTUI**). It is a monorepo with separate packages for the engine, TUI, and editor.

## Quick Start

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Run the TUI application**:
   ```bash
   bun run tui
   ```

   With a specific game:
   ```bash
   bun run tui -- --game demo
   ```

   Load a save (use the save folder name):
   ```bash
   bun run tui -- --load demo_1700000000000
   ```

   Or run the package script directly:
   ```bash
   bun run --filter @venture/tui dev
   ```

3. **Use the editor CLI** to create and validate games:
   ```bash
   bun run editor -- new-game mygame
   bun run editor -- validate mygame
   ```

4. **Type-check the code**:
   ```bash
   bun run typecheck
   ```

## AI Features (Optional)

Some commands use OpenAI via `@ai-sdk/openai` for intent classification, Q&A, and NPC dialogue. Set `OPENAI_API_KEY` in your environment to enable AI-backed features.

## Monorepo Structure

### `packages/engine/` - Headless Game Engine
The core game engine package (`@venture/engine`) contains all game logic and is UI-agnostic.

**Exports**:
- `GameEngine` class - Main API for running games
- TypeScript types (`GameState`, `SceneDefinition`, `ObjectDefinition`, etc.)
- Validation utilities
- Content loader functions
- JSON schemas for game content

**Documentation**: `packages/engine/docs/`
- `architecture.md` - High-level architecture
- `command-architecture.md` - Command interpretation, targets/destinations, and processor flow
- `engine.md` - Turn structure, state, resolution
- `effects.md` - Effects system
- `inventory-and-objects.md` - Objects and inventory

### `packages/tui/` - Terminal UI Application
The TUI package (`@venture/tui`) provides the OpenTUI/React interface.

**Entry Point**: `packages/tui/src/main.tsx`

### `packages/editor/` - CLI Editor
The editor package (`@venture/editor`) provides tools for creating and validating game content.

**Commands**:
- `new-game <gameId>` - Create new game structure
- `new-scene <gameId> <sceneId>` - Create new scene file
- `validate <gameId>` - Validate all game files
- `validate-scene <path>` - Validate single scene file

## Shared Directories

- **`games/`** - Game content. Each game is a subdirectory (e.g., `games/demo/`)
  - `game.json` - Game manifest (ID, name, entry scene)
  - `scenes/<sceneId>/scene.json` - Scene definitions (one folder per scene)
  - `effects.json` - Optional game-specific effect definitions
  - File references: any string starting with `#` in a scene JSON is resolved from a file in the same scene folder (e.g., `"narrative": "#narrative.md"`).

- **`saves/`** - Saved game states. Each save is a folder (e.g., `saves/demo_123456/`)
  - `snapshot.json` - Complete `GameState`
  - `metadata.json` - Save details (turn, timestamp)
  - `history.jsonl` - Action history for replays

## Gameplay Notes

- UI meta-commands start with `:` (e.g., `:save`, `:exit`).

## Documentation

- `AGENTS.md` - Context for AI agents and contributors
- `packages/engine/docs/` - Engine-specific documentation
- `packages/engine/schemas/` - JSON schemas for game content validation

## Development

### Workspace Scripts

- `bun run tui` - Run the TUI application
- `bun run editor` - Run the editor CLI
- `bun run build` - Build all packages
- `bun run typecheck` - Type-check all packages
- `bun run lint` - Lint all packages
- `bun run test` - Run tests for all packages
- `bun run knip` - Run dead-code analysis

### Package-Specific Scripts

```bash
bun run --filter @venture/engine typecheck
bun run --filter @venture/tui dev
bun run --filter @venture/editor <command>
```

## Philosophy

1. **Separation of Concerns**: The engine manages state, validation, and logic. The UI is a renderer that sends commands to the core.
2. **Data-Driven**: Content is defined in JSON files (`game.json`, `scene.json`) under the `games/` directory.
3. **Determinism**: Game state is serializable. Replays are possible by re-running the `actionHistory`.
4. **UI-Agnostic Engine**: The engine can be used with any UI (TUI, web, etc.) without modification.
