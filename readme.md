# Venture TUI Game (Scaffold)

Initial project structure for a terminal-based game built with Bun and TypeScript. This scaffold will grow incrementally; no game mechanics are implemented yet.

## Getting Started

1. Install dependencies (Bun will manage the lockfile automatically):

   ```bash
   bun install
   ```

2. Run the placeholder app:

   ```bash
   bun run src/main.ts
   ```

3. Type-check the code:

   ```bash
   bun run lint
   ```

## Project Structure

- `src/main.ts`: Entry point that wires the configuration into the UI layer.
- `src/config/`: Configuration defaults and loaders.
- `src/core/`: Core game primitives and context helpers.
- `src/ui/`: Terminal UI shell (placeholder banner for now).
- `docs/architecture.md`: Technical plan and implementation roadmap.
- `docs/engine.md`: Headless engine outline (turn structure, characters, action resolution).
- `docs/schema.md`: Human-readable schema rules and examples.
- `content/schemas/scene.schema.json`: JSON Schema for scenes and choices.
- `content/`: Data-driven narrative content (examples included).
- `src/content/`: Placeholder for content-specific tooling and docs.
- Rendering is kept separate from the game engine; the TUI is an adapter on top of a headless loop.
