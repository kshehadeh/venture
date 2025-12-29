import { GameState, ResolutionResult, ActionEffects, CharacterState } from '../types';
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
        }

        // Update character in characters record (effects have already updated context.character)
        let finalNextState = context.nextState.updateCharacter(actorId, () => context.character);

        // Add narrative messages for effects that were added/removed
        const addedEffectIds = (context as any).addedEffectIds || [];
        const removedEffectIds = (context as any).removedEffectIds || [];
        
        if (effectManager && (addedEffectIds.length > 0 || removedEffectIds.length > 0)) {
            const logEntries: import('../types').LogEntry[] = [];
            
            // Add messages for newly applied effects
            for (const effectId of addedEffectIds) {
                const effectDef = effectManager.getEffectDefinition(effectId);
                if (effectDef) {
                    const durationText = effectDef.duration 
                        ? ` (${effectDef.duration} turns)` 
                        : ' (permanent)';
                    logEntries.push({
                        turn: finalNextState.world.turn,
                        text: `You are now affected by: ${effectDef.name}${durationText}. ${effectDef.description || ''}`,
                        type: 'mechanic'
                    });
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
                finalNextState = new GameState({
                    ...finalNextState,
                    log: [...finalNextState.log, ...logEntries]
                });
            }
        }

        // Recalculate current stats for the updated character
        const objectsMap: Record<string, import('../types').ObjectDefinition> = {};
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
        return finalNextState.updateCharacter(actorId, () => characterWithUpdatedStats);
    }

    /**
     * Register a custom effect handler.
     * Useful for game-specific effects or extensions.
     */
    registerEffect(effect: BaseEffect): void {
        this.effects.push(effect);
    }
}

