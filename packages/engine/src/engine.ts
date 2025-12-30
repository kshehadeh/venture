import { GameState, ActionIntent, ResolutionResult, ActionEffects, LogEntry } from "./types";
import { applyEffects } from "./resolution";
import { getCommandRegistry } from "./command";
import { logger } from "./logger";
import { EffectManager } from "./effects";
import { StatCalculator } from "./stats";
import { GameObject } from "./game-object";

// Interface for the Current Scene context needed by the engine to validate/resolve
export interface SceneContext {
    id: string;
    narrative?: string; // Needed for 'look' / reprint actions
    objects?: GameObject[]; // Objects in the scene (filtered by perception)
    exits?: import('./types').ExitDefinition[]; // Exits from this scene
    npcs?: import('./types').NPCDefinition[]; // NPCs defined in this scene
    detailedDescriptions?: import('./types').DetailedDescription[]; // Detailed descriptions for the scene
}

/**
 * Filter objects visible to a character based on their perception stat.
 */
export function getVisibleObjects(
    sceneObjects: GameObject[],
    characterPerception: number
): GameObject[] {
    return sceneObjects.filter(obj => obj.isVisible(characterPerception));
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

    const objectsMap: Record<string, GameObject> = {};
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
export async function processTurn(
    state: GameState,
    intent: ActionIntent,
    scene: SceneContext,
    statCalculator: StatCalculator,
    effectManager: EffectManager
): Promise<TurnResult> {

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
    const command = registry.findCommand(intent);
    
    if (command) {
        logger.log(`[processTurn] Found command: ${command.getCommandId()}, calling resolve`);
        // Pass statCalculator and effectManager to resolve method
        result = await command.resolve(state, intent, scene, statCalculator, effectManager);
        logger.log('[processTurn] Resolution result narrative:', result.narrativeResolver);
    } else {
        return { success: false, reason: `No command found for intent type: ${intent.type}` };
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
            const proximityEffect = obj.proximityEffect;
            if (proximityEffect) {
                proximityEffects.push(proximityEffect);
            }
        }
        
        // Merge proximity effects into result
        if (proximityEffects.length > 0) {
            const merged: ActionEffects = { ...result.effects };
            merged.stats = { ...merged.stats };
            merged.addTraits = [...(merged.addTraits || [])];
            merged.addFlags = [...(merged.addFlags || [])];
            merged.addEffects = [...(merged.addEffects || [])];
            
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
                if (pe.addEffects) {
                    merged.addEffects!.push(...pe.addEffects);
                }
            }
            
            result.effects = merged;
        }
    }

    // 5. Apply Effects -> New State
    let newState = applyEffects(state, result, effectManager);

    // 6. Tick effects on all characters (decrement durations, apply per-turn modifiers)
    const expiredEffects: Array<{ characterId: string; effectId: string }> = [];
    if (effectManager) {
        const updatedCharacters: Record<string, typeof newState.characters[string]> = {};
        for (const [charId, character] of Object.entries(newState.characters)) {
            // Track effects before ticking
            const effectIdsBefore = new Set(character.effects.map(e => e.id));
            const updatedChar = effectManager.tickEffects(character);
            updatedCharacters[charId] = updatedChar;
            
            // Track effects that expired (were present before but not after)
            const effectIdsAfter = new Set(updatedChar.effects.map(e => e.id));
            for (const effectId of effectIdsBefore) {
                if (!effectIdsAfter.has(effectId)) {
                    expiredEffects.push({ characterId: charId, effectId });
                }
            }
        }
        newState.characters = updatedCharacters;
        
        // Add narrative messages for expired effects
        if (expiredEffects.length > 0) {
            const logEntries: LogEntry[] = [];
            for (const { characterId, effectId } of expiredEffects) {
                // Only show messages for player character
                if (characterId === 'player') {
                    const effectDef = effectManager.getEffectDefinition(effectId);
                    if (effectDef) {
                        logEntries.push({
                            turn: newState.world.turn,
                            text: `The effect "${effectDef.name}" has worn off.`,
                            type: 'mechanic'
                        });
                    }
                }
            }
            if (logEntries.length > 0) {
                newState = new GameState({
                    ...newState,
                    log: [...newState.log, ...logEntries]
                });
            }
        }
    }

    // 7. Recalculate current stats for all characters
    const finalCharacters: Record<string, typeof newState.characters[string]> = {};
    for (const [charId, character] of Object.entries(newState.characters)) {
        const objectsMap: Record<string, GameObject> = {};
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
