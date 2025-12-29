import { GameState, ActionEffects, CharacterState } from '../types';
import { EffectManager } from '../effects';
import { StatCalculator } from '../stats';

/**
 * Context passed to effect classes during application
 */
export interface EffectContext {
    currentState: GameState;
    nextState: GameState;
    effects: ActionEffects;
    actorId: string;
    character: CharacterState;
    effectManager?: EffectManager;
    statCalculator: StatCalculator;
    nextSceneId?: string | null;
    // Object definitions for items referenced in effects (populated before removal/addition)
    // This allows effects to access full object definitions even after InventoryEffect modifies inventory
    targetObjects?: Record<string, import('../types').ObjectDefinition>;
}

/**
 * Base class for all effect types.
 * Each effect type should extend this class and implement the apply method.
 * 
 * Effects should call mutation methods on state objects and assign the returned
 * new instances back to the context (e.g., `context.character = context.character.updateBaseStats(...)`,
 * `context.nextState = context.nextState.setCurrentScene(...)`).
 */
export abstract class BaseEffect {
    /**
     * Apply this effect to the game state.
     * Effects should call mutation methods on state objects and assign the returned
     * new instances back to the context.
     */
    abstract apply(context: EffectContext): void;

    /**
     * Check if this effect should be applied based on the ActionEffects.
     * Override this if the effect has specific conditions.
     */
    shouldApply(_effects: ActionEffects): boolean {
        return true;
    }
}

