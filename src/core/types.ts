
export type Stat = 'health' | 'willpower' | 'perception' | 'reputation' | 'strength' | 'agility';

export interface StatBlock {
    health: number;
    willpower: number;
    perception: number;
    reputation: number;
    strength: number;
    agility: number;
}

export type TraitId = string;
export type ItemId = string;
export type FlagId = string;
export type SceneId = string;

export interface InventoryEntry {
    id: ItemId;
    quantity: number;
    objectData?: ObjectDefinition; // Full object data for containers
}

export interface CharacterEffect {
    id: string; // Effect ID (e.g., "blindness", "poisoned")
    source: 'builtin' | 'game'; // Built-in engine effect or game-specific
    duration?: number; // Turns remaining (undefined = permanent)
    statModifiers?: Partial<StatBlock>; // Static stat modifiers (applied once)
    perTurnModifiers?: Partial<StatBlock>; // Cumulative stat changes per turn (e.g., poison: -1 health/turn)
    metadata?: Record<string, any>; // Additional effect data
}

export interface EffectDefinition {
    id: string;
    name: string;
    description: string;
    statModifiers?: Partial<StatBlock>; // Static stat modifiers
    perTurnModifiers?: Partial<StatBlock>; // Per-turn stat changes
    duration?: number; // Default duration if not specified
    builtin?: boolean; // Is this a built-in engine effect?
}

export interface LogEntry {
    turn: number;
    text: string;
    tags?: string[];
    type: 'narrative' | 'mechanic' | 'debug' | 'user_input';
}

// Actions

export interface ActionIntent {
    actorId: string; // usually "player"
    type: string; // Command ID - should match a command from the command registry
    sceneId?: SceneId; // Context: which scene is this from (validation)
    itemId?: ItemId;     // For use_item commands or transfer commands
    targetId?: string;   // Optional target (object ID for pickup, direction for move, container ID for transfer)
    timestamp?: number;
    originalInput?: string; // Original user input for AI fallback in commands
}

export type ResolutionOutcome = 'success' | 'failure' | 'partial';

export interface ActionRequirements {
    stats?: Partial<StatBlock>;
    traits?: TraitId[];
    flags?: FlagId[];
    items?: InventoryEntry[]; // Checks for presence/quantity
}

export interface ActionEffects {
    stats?: Partial<Record<keyof StatBlock, number>>; // Deltas (applied to baseStats)
    addTraits?: TraitId[];
    removeTraits?: TraitId[];
    addFlags?: FlagId[];
    removeFlags?: FlagId[];
    addItems?: InventoryEntry[];
    removeItems?: InventoryEntry[];
    addEffects?: string[]; // Effect IDs to apply
    removeEffects?: string[]; // Effect IDs to remove
    targetCharacterId?: string; // Character ID to apply effects to (defaults to actorId)
    transferItem?: {
        itemId: string;
        fromContainerId: string | null; // null if item is directly in inventory
        toContainerId: string; // destination container ID
        slotId?: string; // Optional slot ID within the destination container
    };
    hiddenConsequences?: string[];
    reprintNarrative?: boolean;
    listInventory?: boolean;
}

export interface DetailedDescription {
    text: string;
    perception: number;
    effects?: ActionEffects; // Optional effects that apply when this detail is visible
}

export interface ResolutionResult {
    outcome: ResolutionOutcome;
    narrativeResolver: string; // Description of what happened
    effects?: ActionEffects;   // The effects to apply
    nextSceneId?: SceneId | null; // null for game end
}

export interface GameManifest {
    id: string;
    name: string;
    description: string;
    entrySceneId: string;
    globalActions?: any[]; // Using any for now, ideally ChoiceDefinition-like
}

// Need to reference SceneContext from somewhere, or redefine minimal interface
// For avoiding circular deps, let's look at engine.ts or define SceneContext here.
// Assuming SceneContext is the runtime object.

export interface SlotDefinition {
    id: string; // Unique identifier within the container
    name?: string; // Display name (optional, defaults to id)
    maxWeight?: number; // Maximum weight capacity
    width?: number; // Width dimension constraint
    height?: number; // Height dimension constraint
    depth?: number; // Depth dimension constraint
    itemId?: string | null; // Currently assigned item ID (null if empty)
}

export interface ObjectDefinition {
    id: string;
    quantity?: number; // Defaults to 1
    weight: number;
    perception: number; // Perception required to notice it
    removable: boolean; // Whether it can be picked up
    description: string;
    traits: string[]; // Array of trait strings
    statModifiers?: Partial<StatBlock>; // Continuous stat modifiers while carried
    carryEffects?: ActionEffects; // Effects when picked up
    viewEffects?: ActionEffects; // Effects when looked at
    proximityEffect?: ActionEffects; // Effects when in scene with it
    contains?: ObjectDefinition[]; // Nested objects (if container) - general storage
    slots?: SlotDefinition[]; // Named slots that can each hold exactly one item
    maxWeight?: number; // Max weight for containers
    maxItems?: number; // Max number of items for containers
    width?: number; // Width dimension
    height?: number; // Height dimension
    depth?: number; // Depth dimension
    detailedDescriptions?: DetailedDescription[]; // Detailed descriptions with perception thresholds
}

export type Direction = 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se';

export interface ExitDefinition {
    direction: Direction;
    type?: 'opening' | 'door' | string; // Optional type (opening, door, etc.)
    name?: string; // Optional descriptive name (e.g., "archway")
    description?: string; // Optional full description
    nextSceneId: string; // The scene to transition to
    requirements?: ActionRequirements; // Optional requirements to use this exit
    perception?: number; // Perception required to notice this exit (defaults to 0)
    detailedDescriptions?: DetailedDescription[]; // Detailed descriptions with perception thresholds
}

export interface NPCDefinition {
    id: string; // Unique NPC ID
    name: string;
    baseStats: StatBlock;
    traits?: string[]; // Optional traits
    description?: string; // Optional description for display
    detailedDescriptions?: DetailedDescription[]; // Detailed descriptions with perception thresholds
}

export interface SceneDefinition {
    id: string;
    narrative: string;
    objects?: ObjectDefinition[]; // Objects in the scene
    exits?: ExitDefinition[]; // Exits to other scenes
    npcs?: NPCDefinition[]; // Non-player characters in this scene
    detailedDescriptions?: DetailedDescription[]; // Detailed descriptions with perception thresholds
}

export interface GameContent {
    manifest: GameManifest;
    scenes: Record<string, SceneDefinition>;
    effectDefinitions?: Record<string, EffectDefinition>;
}

/**
 * Complete view model containing everything the UI needs to display.
 * This is the interface between the engine and UI layers.
 */
export interface GameView {
    state: import('./game-state').GameState;
    currentSceneNarrative: string;
    currentSceneName?: string; // Display name for the current scene
    currentSceneExits?: ExitDefinition[]; // Visible exits from current scene
    currentSceneObjects?: ObjectDefinition[]; // Visible objects in current scene
    currentSceneNPCs?: NPCDefinition[]; // NPCs in current scene
    errorMessage?: string;  // For validation/parsing errors
    normalizedInput?: import('./command').NormalizedCommandInput; // For debugging - last normalized command input
}

// Re-export state classes from their own files
export { CharacterState } from './character-state';
export { WorldState } from './world-state';
export { GameState } from './game-state';
