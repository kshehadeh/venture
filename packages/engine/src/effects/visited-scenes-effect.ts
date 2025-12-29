import { BaseEffect, EffectContext } from './base-effect';
import { WorldState } from '../types';

/**
 * Effect that marks scenes as visited.
 */
export class VisitedScenesEffect extends BaseEffect {
    shouldApply(): boolean {
        return true; // Always apply to mark current scene as visited
    }

    apply(context: EffectContext): void {
        const { currentState, nextState } = context;
        
        // Mark the scene we just LEFT, or the one we just ENTERED?
        // Logic: "visitedScenes". If I am in "intro", and go to "crossroads". "intro" is visited.
        if (nextState.currentSceneId !== currentState.currentSceneId) {
            let updatedWorld = nextState.world instanceof WorldState ? nextState.world : new WorldState(nextState.world);
            updatedWorld = updatedWorld.markSceneVisited(currentState.currentSceneId);
            context.nextState = context.nextState.updateWorld(() => updatedWorld);
        }
    }
}

