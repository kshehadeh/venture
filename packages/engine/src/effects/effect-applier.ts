import { GameState, ResolutionResult, CharacterState } from '../types';
import { EffectManager } from '../effects';
import { StatCalculator } from '../stats';
import { BaseEffect, EffectContext } from './base-effect';
import { StatsEffect } from './stats-effect';
import { TraitsEffect } from './traits-effect';
import { FlagsEffect } from './flags-effect';
import { CharacterEffectsEffect } from './character-effects-effect';
import { InventoryEffect } from './inventory-effect';
import { TransferItemEffect } from './transfer-item-effect';
import { SceneTransitionEffect } from './scene-transition-effect';
import { SceneObjectsEffect } from './scene-objects-effect';
import { VisitedScenesEffect } from './visited-scenes-effect';
import { ProximityEffectRemovalEffect } from './proximity-effect-removal-effect';
import { StateEffect } from './state-effect';

/**
 * Orchestrates the application of all effects to the game state.
 * Uses individual effect classes to apply each type of effect.
 */
export class EffectApplier {
    private effects: BaseEffect[];

    constructor() {
        // Initialize all effect handlers
        this.effects = [
            new StatsEffect(),
            new TraitsEffect(),
            new FlagsEffect(),
            new CharacterEffectsEffect(),
            new InventoryEffect(),
            new TransferItemEffect(),
            new SceneObjectsEffect(),
            new VisitedScenesEffect(),
            new StateEffect(),
        ];
    }

    /**
     * Apply all effects from a resolution result to the game state.
     * Returns a new state with all effects applied.
     */
    applyEffects(
        currentState: GameState,
        result: ResolutionResult,
        effectManager?: EffectManager
    ): GameState {
        if (result.outcome === 'failure') {
            return currentState; // No changes on failure
        }

        const effects = result.effects || {};
        // Clone state using class methods if available, otherwise create new instance
        const nextState = currentState instanceof GameState ? currentState.clone() : new GameState(currentState);

        // Get the actor character (default to player)
        const actorId = effects.targetCharacterId || 'player';
        const char = nextState.characters[actorId];
        if (!char) {
            return nextState; // Character not found
        }

        // Ensure character is a CharacterState instance
        const charInstance = char instanceof CharacterState ? char : new CharacterState(char);
        const statCalculator = new StatCalculator();

        // Build effectSources map to track which effects came from which sources
        const effectSources = new Map<string, { type: 'carryEffect' | 'proximityEffect', objectId: string, sceneId?: string }>();
        
        // Track carryEffects: match addItems with their carryEffects.addEffects
        if (effects.addItems) {
            for (const item of effects.addItems) {
                // Get the object definition from item.objectData (should be set by pickup command)
                const objectDef = item.objectData;
                if (objectDef?.carryEffects?.addEffects) {
                    for (const effectId of objectDef.carryEffects.addEffects) {
                        effectSources.set(effectId, {
                            type: 'carryEffect',
                            objectId: item.id
                        });
                    }
                }
            }
        }
        
        // Track proximityEffect: when entering a new scene, check objects in that scene
        if (result.nextSceneId && result.nextSceneId !== currentState.currentSceneId) {
            const nextSceneObjects = nextState.sceneObjects[result.nextSceneId] || [];
            for (const obj of nextSceneObjects) {
                if (obj.proximityEffect?.addEffects) {
                    for (const effectId of obj.proximityEffect.addEffects) {
                        effectSources.set(effectId, {
                            type: 'proximityEffect',
                            objectId: obj.id,
                            sceneId: result.nextSceneId
                        });
                    }
                }
            }
        }

        // Create effect context
        const context: EffectContext = {
            currentState,
            nextState,
            effects,
            actorId,
            character: charInstance,
            effectManager,
            statCalculator,
            nextSceneId: result.nextSceneId,
            effectSources: effectSources.size > 0 ? effectSources : undefined,
        };

        // Apply all effects that should be applied
        for (const effect of this.effects) {
            if (effect.shouldApply(effects)) {
                effect.apply(context);
                // Effects update context.character and context.nextState directly
            }
        }

        // Handle scene transition (special case as it uses result.nextSceneId, not effects)
        if (result.nextSceneId !== undefined) {
            const sceneTransitionEffect = new SceneTransitionEffect();
            sceneTransitionEffect.apply(context);
            
            // Remove proximity effects from the scene being left
            // This runs after scene transition but before stat recalculation
            const proximityRemovalEffect = new ProximityEffectRemovalEffect();
            proximityRemovalEffect.apply(context);
        }

        // Update character in characters record (effects have already updated context.character)
        let finalNextState = context.nextState.updateCharacter(actorId, () => context.character);

        // Recalculate current stats for the updated character
        const objectsMap: Record<string, import('../game-object').GameObject> = {};
        for (const entry of context.character.inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
            }
        }
        const characterWithUpdatedStats = statCalculator.updateCharacterStats(
            context.character,
            objectsMap
        );
        
        // Update the character with recalculated stats
        finalNextState = finalNextState.updateCharacter(actorId, () => characterWithUpdatedStats);

        // Add narrative messages for effects that were added/removed
        // Do this AFTER all character updates to ensure log entries are preserved
        const addedEffectIds = (context as any).addedEffectIds || [];
        const removedEffectIds = (context as any).removedEffectIds || [];
        
        if (effectManager && (addedEffectIds.length > 0 || removedEffectIds.length > 0)) {
            const logEntries: import('../types').LogEntry[] = [];
            
            // Add messages for newly applied effects
            for (const effectId of addedEffectIds) {
                const effectDef = effectManager.getEffectDefinition(effectId);
                if (effectDef) {
                    // If applicationDescription exists, create an 'effect' type log entry
                    if (effectDef.applicationDescription) {
                        logEntries.push({
                            turn: finalNextState.world.turn,
                            text: effectDef.applicationDescription,
                            type: 'effect'
                        });
                    }
                    // Also create a mechanic entry for status (unless we have applicationDescription, then make it more concise)
                    const durationText = effectDef.duration 
                        ? ` (${effectDef.duration} turns)` 
                        : ' (permanent)';
                    if (effectDef.applicationDescription) {
                        // If we have applicationDescription, make the mechanic entry more concise
                        logEntries.push({
                            turn: finalNextState.world.turn,
                            text: `Effect: ${effectDef.name}${durationText}`,
                            type: 'mechanic'
                        });
                    } else {
                        // If no applicationDescription, use the full description
                        logEntries.push({
                            turn: finalNextState.world.turn,
                            text: `You are now affected by: ${effectDef.name}${durationText}. ${effectDef.description || ''}`,
                            type: 'mechanic'
                        });
                    }
                }
            }
            
            // Add messages for removed effects
            for (const effectId of removedEffectIds) {
                const effectDef = effectManager.getEffectDefinition(effectId);
                if (effectDef) {
                    logEntries.push({
                        turn: finalNextState.world.turn,
                        text: `The effect "${effectDef.name}" has worn off.`,
                        type: 'mechanic'
                    });
                }
            }
            
            // Add log entries to state
            if (logEntries.length > 0) {
                finalNextState = finalNextState.addLog(...logEntries);
            }
        }
        
        return finalNextState;
    }

    /**
     * Register a custom effect handler.
     * Useful for game-specific effects or extensions.
     */
    registerEffect(effect: BaseEffect): void {
        this.effects.push(effect);
    }
}

