import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects, CharacterState } from '../types';

/**
 * Effect that modifies character base stats.
 */
export class StatsEffect extends BaseEffect {
    shouldApply(effects: ActionEffects): boolean {
        return !!effects.stats && Object.keys(effects.stats).length > 0;
    }

    apply(context: EffectContext): void {
        const { effects, character } = context;
        
        if (!effects.stats) {
            return;
        }

        // Resolve target - stat modifiers only apply to characters
        const target = this.resolveTarget(context);
        if (!target || target.type !== 'character') {
            // Stat modifiers only apply to characters
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
        const charInstance = targetCharacter instanceof CharacterState ? targetCharacter : new CharacterState(targetCharacter);
        const updatedChar = charInstance.updateBaseStats(effects.stats);

        // Update the character in context
        if (target.id && target.id !== context.actorId) {
            // Update NPC in state
            context.nextState = context.nextState.updateCharacter(target.id, () => updatedChar);
        } else {
            // Update actor character
            context.character = updatedChar;
        }
    }
}

