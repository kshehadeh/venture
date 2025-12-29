import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects, CharacterState } from '../types';

/**
 * Effect that removes proximity effects when leaving a scene.
 * Proximity effects are applied when entering a scene and should be removed when leaving.
 */
export class ProximityEffectRemovalEffect extends BaseEffect {
    shouldApply(_effects: ActionEffects): boolean {
        // This effect is triggered by scene transitions, not by ActionEffects
        // We'll check in apply() if we're leaving a scene
        return false; // Always false, we handle it manually in EffectApplier
    }

    apply(context: EffectContext): void {
        const { currentState, nextState, character, effectManager } = context;
        
        // Only remove proximity effects when leaving a scene (not when entering)
        if (!nextState.currentSceneId || nextState.currentSceneId === currentState.currentSceneId) {
            return; // Not a scene transition or staying in same scene
        }
        
        // We're leaving currentState.currentSceneId
        const sceneBeingLeft = currentState.currentSceneId;
        
        if (!effectManager) {
            return;
        }

        // Ensure character is a CharacterState instance
        let updatedChar = character instanceof CharacterState ? character : new CharacterState(character);
        
        // Find all effects with proximityEffect source from the scene being left
        const effectsToRemove: string[] = [];
        for (const effect of updatedChar.effects) {
            if (effect.metadata?.sourceType === 'proximityEffect' && 
                effect.metadata?.sourceSceneId === sceneBeingLeft) {
                effectsToRemove.push(effect.id);
            }
        }
        
        // Remove the effects
        for (const effectId of effectsToRemove) {
            updatedChar = effectManager.removeEffect(updatedChar, effectId);
            if (!(updatedChar instanceof CharacterState)) {
                updatedChar = new CharacterState(updatedChar);
            }
        }
        
        // Track removed effects for log messages
        if (effectsToRemove.length > 0) {
            (context as any).removedEffectIds = [
                ...((context as any).removedEffectIds || []),
                ...effectsToRemove
            ];
        }
        
        context.character = updatedChar;
    }
}

