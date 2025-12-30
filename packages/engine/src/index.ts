// Main GameEngine class
export { GameEngine } from './game-engine';

// All TypeScript types
export type {
    Stat,
    StatBlock,
    TraitId,
    ItemId,
    FlagId,
    SceneId,
    InventoryEntry,
    CharacterEffect,
    EffectDefinition,
    LogEntry,
    ActionIntent,
    ResolutionOutcome,
    ActionRequirements,
    ActionEffects,
    DetailedDescription,
    ResolutionResult,
    GameManifest,
    SlotDefinition,
    ObjectDefinition,
    Direction,
    ExitDefinition,
    NPCDefinition,
    SceneDefinition,
    GameContent,
    GameView
} from './types';

// State classes
export { CharacterState } from './character-state';
export { WorldState } from './world-state';
export { GameState } from './game-state';
export { GameObject } from './game-object';

// Loader utilities
export { loadGame, loadGameList } from './loader';

// Save/Load utilities
export { saveGame, loadSave, listSaves } from './save';
export type { SaveMetadata } from './save';

// Validation utilities
export { validateRequirements, validateCarryingCapacity } from './validation';
export type { ValidationResult } from './validation';

// Command registry (for editor validation)
export { getCommandRegistry } from './command';
export type { Command } from './commands/base-command';
export type { NormalizedCommandInput, CommandResult } from './command';

// Engine utilities
export { processTurn, getVisibleObjects, getVisibleExits, getCharacterPerception } from './engine';
// SceneContext is an internal type - not exported in public API

// Schema paths (for editor) - relative to engine package root
// These can be resolved using: new URL(SCHEMA_PATHS.scene, import.meta.resolve('@venture/engine'))
export const SCHEMA_PATHS = {
    scene: '../schemas/scene.schema.json'
} as const;

