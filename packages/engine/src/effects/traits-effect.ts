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

        // Resolve target - traits only apply to characters
        const target = this.resolveTarget(context);
        if (!target || target.type !== 'character') {
            // Traits only apply to characters
            return;
        }

        // Get the target character
        let targetCharacter = character;
        if (target.id && target.id !== context.actorId) {
            // Target a different character (NPC)
            const targetChar = context.nextState.characters[target.id];
            if (!targetChar) {
                return; // Character not found
            }
            targetCharacter = targetChar instanceof CharacterState ? targetChar : new CharacterState(targetChar);
        }

        // Ensure character is a CharacterState instance
        let charInstance = targetCharacter instanceof CharacterState ? targetCharacter : new CharacterState(targetCharacter);
        
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
        
        // Update the character in context
        if (target.id && target.id !== context.actorId) {
            // Update NPC in state
            context.nextState = context.nextState.updateCharacter(target.id, () => charInstance);
        } else {
            // Update actor character
            context.character = charInstance;
        }
    }
}

