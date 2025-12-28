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
        const finalNextState = context.nextState.updateCharacter(actorId, () => context.character);

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

