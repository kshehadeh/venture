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

        if (effects.addEffects) {
            for (const effectId of effects.addEffects) {
                updatedChar = effectManager.applyEffect(updatedChar, effectId);
                // EffectManager returns CharacterState, but we need to ensure it's an instance
                if (!(updatedChar instanceof CharacterState)) {
                    updatedChar = new CharacterState(updatedChar);
                }
            }
        }

        if (effects.removeEffects) {
            for (const effectId of effects.removeEffects) {
                updatedChar = effectManager.removeEffect(updatedChar, effectId);
                // EffectManager returns CharacterState, but we need to ensure it's an instance
                if (!(updatedChar instanceof CharacterState)) {
                    updatedChar = new CharacterState(updatedChar);
                }
            }
        }

        context.character = updatedChar;
    }
}

