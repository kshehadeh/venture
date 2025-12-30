import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects } from '../types';

/**
 * Effect that handles object state transitions.
 * Applies effects from new state and removes effects from previous state.
 */
export class StateEffect extends BaseEffect {
    shouldApply(effects: ActionEffects): boolean {
        // Check if this effect has a setObjectState field (set by SetStateCommand)
        return !!(effects as any).setObjectState;
    }

    apply(context: EffectContext): void {
        const { effects } = context;
        
        const setObjectState = (effects as any).setObjectState;
        if (!setObjectState || !setObjectState.objectId || !setObjectState.stateId) {
            return;
        }

        const { objectId, stateId } = setObjectState;

        // Update the object state in GameState
        context.nextState = context.nextState.setObjectState(objectId, stateId);
    }
}

