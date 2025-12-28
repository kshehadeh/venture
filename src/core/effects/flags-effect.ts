import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects, WorldState } from '../types';

/**
 * Effect that adds or removes world flags.
 */
export class FlagsEffect extends BaseEffect {
    shouldApply(effects: ActionEffects): boolean {
        return !!(effects.addFlags && effects.addFlags.length > 0) ||
               !!(effects.removeFlags && effects.removeFlags.length > 0);
    }

    apply(context: EffectContext): void {
        const { effects, nextState } = context;
        
        if (!effects.addFlags && !effects.removeFlags) {
            return;
        }

        // Update world through GameState mutation method
        let updatedWorld = nextState.world instanceof WorldState ? nextState.world : new WorldState(nextState.world);
        
        if (effects.addFlags) {
            for (const flag of effects.addFlags) {
                updatedWorld = updatedWorld.addFlag(flag);
            }
        }
        
        if (effects.removeFlags) {
            for (const flag of effects.removeFlags) {
                updatedWorld = updatedWorld.removeFlag(flag);
            }
        }
        
        context.nextState = context.nextState.updateWorld(() => updatedWorld);
    }
}

