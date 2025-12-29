import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects, StatBlock, CharacterState } from '../types';

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

        // Ensure character is a CharacterState instance
        const charInstance = character instanceof CharacterState ? character : new CharacterState(character);
        context.character = charInstance.updateBaseStats(effects.stats);
    }
}

