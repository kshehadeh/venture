import { GameState, ActionIntent, ResolutionResult, LogEntry, ObjectDefinition, ActionEffects } from "./types";
import { applyEffects } from "./resolution";
import { getCommandRegistry } from "./command";
import { logger } from "./logger";
import { EffectManager } from "./effects";
import { StatCalculator } from "./stats";

// Interface for the Current Scene context needed by the engine to validate/resolve
export interface SceneContext {
    id: string;
    narrative?: string; // Needed for 'look' / reprint actions
    objects?: ObjectDefinition[]; // Objects in the scene (filtered by perception)
    exits?: import('./types').ExitDefinition[]; // Exits from this scene
    npcs?: import('./types').NPCDefinition[]; // NPCs defined in this scene
}

/**
 * Filter objects visible to a character based on their perception stat.
 */
export function getVisibleObjects(
    sceneObjects: ObjectDefinition[],
    characterPerception: number
): ObjectDefinition[] {
    return sceneObjects.filter(obj => obj.perception <= characterPerception);
}

/**
 * Get current perception stat for a character using StatCalculator
 */
export function getCharacterPerception(
    state: GameState,
    characterId: string,
    statCalculator: StatCalculator
): number {
    const character = state.characters[characterId];
    if (!character) {
        return 0;
    }

    const objectsMap: Record<string, ObjectDefinition> = {};
    for (const entry of character.inventory) {
        if (entry.objectData) {
            objectsMap[entry.id] = entry.objectData;
        }
    }

    return statCalculator.getEffectiveStat(character, 'perception', objectsMap);
}

/**
 * Filter exits visible to a character based on their perception stat.
 */
export function getVisibleExits(
    exits: import('./types').ExitDefinition[],
    characterPerception: number
): import('./types').ExitDefinition[] {
    return exits.filter(exit => (exit.perception || 0) <= characterPerception);
}

export type TurnResult =
    | { success: true; newState: GameState; output: ResolutionResult }
    | { success: false; reason: string };

/**
 * Process a single turn given a state, an intent, and the context (current scene).
 * Pure function: (State, Input, Context) -> Result
 */
export function processTurn(
    state: GameState,
    intent: ActionIntent,
    scene: SceneContext,
    statCalculator: StatCalculator,
    effectManager: EffectManager
): TurnResult {

    // 1. Context Check
    // Allow global actions (which might not strictly match scene ID if we considered them distinct)
    // But conceptually, if injected into context, they are "part" of the scene for this turn.
    if (scene.id !== state.currentSceneId) {
        return { success: false, reason: "Scene context mismatch" };
    }

    // 2. Resolve Outcomes using command's resolve method
    let result: ResolutionResult;
    logger.log('[processTurn] Processing intent:', JSON.stringify(intent, null, 2));
    logger.log('[processTurn] Intent type:', intent.type);
    
    const registry = getCommandRegistry();
    let command = null;
    
    // Get command based on intent type
    if (intent.type === 'choice' && intent.choiceId) {
        // For choice type, use choiceId to find the command
        command = registry.getCommand(intent.choiceId);
    } else if (intent.type === 'pickup') {
        command = registry.getCommand('pickup');
    } else if (intent.type === 'move') {
        command = registry.getCommand('move');
    } else if (intent.type === 'look') {
        command = registry.getCommand('look');
    } else if (intent.type === 'items') {
        command = registry.getCommand('items');
    } else if (intent.type === 'transfer') {
        command = registry.getCommand('transfer');
    } else if (intent.type === 'effects') {
        command = registry.getCommand('effects');
    } else if (intent.type === 'help') {
        command = registry.getCommand('help');
    }
    
    if (command) {
        logger.log(`[processTurn] Found command: ${command.getCommandId()}, calling resolve`);
        // Pass statCalculator and effectManager to resolve method
        result = command.resolve(state, intent, scene, statCalculator, effectManager);
        logger.log('[processTurn] Resolution result narrative:', result.narrativeResolver);
    } else {
        return { success: false, reason: `No command found for intent type: ${intent.type}, choiceId: ${intent.choiceId}` };
    }
    
    // Apply proximity effects when entering a scene (if this is a scene transition)
    // This happens after resolution but before applying effects
    if (result.nextSceneId && result.nextSceneId !== state.currentSceneId) {
        const actorId = intent.actorId || 'player';
        const characterPerception = getCharacterPerception(state, actorId, statCalculator);
        const nextSceneObjects = state.sceneObjects[result.nextSceneId] || [];
        const visibleNextObjects = getVisibleObjects(nextSceneObjects, characterPerception);
        
        // Collect proximity effects
        const proximityEffects: ActionEffects[] = [];
        for (const obj of visibleNextObjects) {
            if (obj.proximityEffect) {
                proximityEffects.push(obj.proximityEffect);
            }
        }
        
        // Merge proximity effects into result
        if (proximityEffects.length > 0) {
            const merged: ActionEffects = { ...result.effects };
            merged.stats = { ...merged.stats };
            merged.addTraits = [...(merged.addTraits || [])];
            merged.addFlags = [...(merged.addFlags || [])];
            
            for (const pe of proximityEffects) {
                if (pe.stats) {
                    for (const [key, value] of Object.entries(pe.stats)) {
                        merged.stats![key as keyof typeof merged.stats] = (merged.stats![key as keyof typeof merged.stats] || 0) + value;
                    }
                }
                if (pe.addTraits) {
                    merged.addTraits!.push(...pe.addTraits);
                }
                if (pe.addFlags) {
                    merged.addFlags!.push(...pe.addFlags);
                }
            }
            
            result.effects = merged;
        }
    }

    // 5. Apply Effects -> New State
    let newState = applyEffects(state, result, statCalculator, effectManager);

    // 6. Tick effects on all characters (decrement durations, apply per-turn modifiers)
    if (effectManager) {
        const updatedCharacters: Record<string, typeof newState.characters[string]> = {};
        for (const [charId, character] of Object.entries(newState.characters)) {
            updatedCharacters[charId] = effectManager.tickEffects(character);
        }
        newState.characters = updatedCharacters;
    }

    // 7. Recalculate current stats for all characters
    const finalCharacters: Record<string, typeof newState.characters[string]> = {};
    for (const [charId, character] of Object.entries(newState.characters)) {
        const objectsMap: Record<string, ObjectDefinition> = {};
        for (const entry of character.inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
            }
        }
        finalCharacters[charId] = statCalculator.updateCharacterStats(character, objectsMap);
    }
    newState.characters = finalCharacters;

    // Record Action
    newState.actionHistory = [...newState.actionHistory, { ...intent, timestamp: Date.now() }];

    // 8. Append Log & Increment Turn
    newState.log = [...newState.log, {
        turn: newState.world.turn,
        text: result.narrativeResolver,
        type: 'narrative'
    }];

    newState.world.turn += 1;

    return { success: true, newState, output: result };
}
