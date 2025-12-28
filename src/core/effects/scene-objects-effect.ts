import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects } from '../types';

/**
 * Effect that removes objects from sceneObjects when they are picked up.
 */
export class SceneObjectsEffect extends BaseEffect {
    shouldApply(effects: ActionEffects): boolean {
        return !!(effects.addItems && effects.addItems.length > 0);
    }

    apply(context: EffectContext): void {
        const { effects, currentState, nextState } = context;
        
        if (!effects.addItems || !nextState.sceneObjects[currentState.currentSceneId]) {
            return;
        }

        // Use mutation method to remove scene objects
        for (const item of effects.addItems) {
            context.nextState = context.nextState.removeSceneObject(currentState.currentSceneId, item.id);
        }
    }
}

