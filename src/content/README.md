# Content Directory

This folder will store game content such as scenes, items, and other data-driven assets. Content should be defined in JSON (or YAML) and validated at load time before the engine begins execution.

## Goals
- Keep narrative and gameplay data out of code so non-programmers can author content.
- Support schema validation to catch broken references early.
- Allow expansion without touching engine code.

## Suggested layout
- `scenes/`: Narrative nodes and choices.
- `items/`: Item definitions and metadata.
- `encounters/`: Specialized sequences or reusable encounters.
- `examples/`: Sample content to accompany tests.
