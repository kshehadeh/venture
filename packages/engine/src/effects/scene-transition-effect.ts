import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects } from '../types';

/**
 * Effect that handles scene transitions.
 * Note: This effect is special because it uses result.nextSceneId, not effects.
 * It's handled separately in EffectApplier.
 */
export class SceneTransitionEffect extends BaseEffect {
    shouldApply(_effects: ActionEffects): boolean {
        // This is always false because we check result.nextSceneId in EffectApplier
        return false;
    }

    apply(context: EffectContext): void {
        const { nextSceneId, nextState } = context;
        
        if (nextSceneId === undefined) {
            return;
        }

        // If null, it means end game, but we store it.
        // Ensure we handle null in the Engine loop.
        // Use mutation method instead of direct property assignment
        context.nextState = nextState.setCurrentScene(nextSceneId);
    }
}

