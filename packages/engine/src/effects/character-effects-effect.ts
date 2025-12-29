import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects, CharacterState } from '../types';

/**
 * Effect that applies or removes character effects (via EffectManager).
 */
export class CharacterEffectsEffect extends BaseEffect {
    shouldApply(effects: ActionEffects): boolean {
        return !!(effects.addEffects && effects.addEffects.length > 0) ||
               !!(effects.removeEffects && effects.removeEffects.length > 0);
    }

    apply(context: EffectContext): void {
        const { effects, character, effectManager } = context;
        
        if (!effectManager) {
            return;
        }

        // EffectManager methods return CharacterState, so we can use them directly
        // but we need to ensure we're working with a CharacterState instance
        let updatedChar = character instanceof CharacterState ? character : new CharacterState(character);

        // Track added/removed effects for narrative messages
        const addedEffectIds: string[] = [];
        const removedEffectIds: string[] = [];

        if (effects.addEffects) {
            for (const effectId of effects.addEffects) {
                // Check if effect is already applied (to avoid duplicate messages)
                const alreadyHasEffect = updatedChar.effects.some(e => e.id === effectId);
                updatedChar = effectManager.applyEffect(updatedChar, effectId);
                // EffectManager returns CharacterState, but we need to ensure it's an instance
                if (!(updatedChar instanceof CharacterState)) {
                    updatedChar = new CharacterState(updatedChar);
                }
                
                // If source tracking exists for this effect, update its metadata
                if (context.effectSources?.has(effectId)) {
                    const source = context.effectSources.get(effectId)!;
                    // Find the effect we just added and update its metadata
                    const effectIndex = updatedChar.effects.findIndex(e => e.id === effectId);
                    if (effectIndex >= 0) {
                        const effect = updatedChar.effects[effectIndex];
                        const updatedEffect = {
                            ...effect,
                            metadata: {
                                ...effect.metadata,
                                sourceType: source.type,
                                sourceObjectId: source.objectId,
                                ...(source.sceneId && { sourceSceneId: source.sceneId })
                            }
                        };
                        // Create new effects array with updated effect
                        const newEffects = [...updatedChar.effects];
                        newEffects[effectIndex] = updatedEffect;
                        // Create new CharacterState with updated effects
                        updatedChar = new CharacterState({
                            ...updatedChar,
                            effects: newEffects
                        });
                    }
                }
                
                // Only track if it wasn't already applied
                if (!alreadyHasEffect) {
                    addedEffectIds.push(effectId);
                }
            }
        }

        if (effects.removeEffects) {
            for (const effectId of effects.removeEffects) {
                // Check if effect exists before removing
                const hasEffect = updatedChar.effects.some(e => e.id === effectId);
                updatedChar = effectManager.removeEffect(updatedChar, effectId);
                // EffectManager returns CharacterState, but we need to ensure it's an instance
                if (!(updatedChar instanceof CharacterState)) {
                    updatedChar = new CharacterState(updatedChar);
                }
                // Only track if it was actually removed
                if (hasEffect) {
                    removedEffectIds.push(effectId);
                }
            }
        }

        context.character = updatedChar;
        
        // Store added/removed effect IDs in context for narrative generation
        // We'll use a custom property on the context to pass this info
        (context as any).addedEffectIds = addedEffectIds;
        (context as any).removedEffectIds = removedEffectIds;
    }
}

