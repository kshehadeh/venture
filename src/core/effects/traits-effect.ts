import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects, CharacterState } from '../types';

/**
 * Effect that adds or removes character traits.
 */
export class TraitsEffect extends BaseEffect {
    shouldApply(effects: ActionEffects): boolean {
        return !!(effects.addTraits && effects.addTraits.length > 0) ||
               !!(effects.removeTraits && effects.removeTraits.length > 0);
    }

    apply(context: EffectContext): void {
        const { effects, character } = context;
        
        if (!effects.addTraits && !effects.removeTraits) {
            return;
        }

        // Ensure character is a CharacterState instance
        let charInstance = character instanceof CharacterState ? character : new CharacterState(character);
        
        // Apply trait additions
        if (effects.addTraits) {
            for (const trait of effects.addTraits) {
                charInstance = charInstance.addTrait(trait);
            }
        }
        
        // Apply trait removals
        if (effects.removeTraits) {
            for (const trait of effects.removeTraits) {
                charInstance = charInstance.removeTrait(trait);
            }
        }
        
        context.character = charInstance;
    }
}

