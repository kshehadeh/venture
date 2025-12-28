import {
    GameState,
    ResolutionResult,
    ActionEffects,
} from "./types";
import { EffectManager } from "./effects";
import { EffectApplier } from "./effects/effect-applier";

// Interface for command metadata (used by ENGINE_GLOBAL_ACTIONS).
// This is used to define aliases and metadata for engine commands, not for scene choices.
// Note: Scene choices no longer exist - everything operates through commands.
export interface ChoiceDefinition {
    id: string;
    text?: string;
    aliases?: string[];
    requirements?: any; // Handled by validation
    effects?: ActionEffects;
    nextSceneId?: string | null;
}


// Singleton instance of EffectApplier for backward compatibility
let effectApplierInstance: EffectApplier | null = null;

function getEffectApplier(): EffectApplier {
    if (!effectApplierInstance) {
        effectApplierInstance = new EffectApplier();
    }
    return effectApplierInstance;
}

/**
 * Pure function to apply effects to a state and return a NEW state (immutable-ish).
 * Note: deep cloning is expensive, so we might do shallow copies where needed.
 * For this implementation, we will perform structural sharing updates.
 * 
 * This function now delegates to the class-based EffectApplier system for better
 * extensibility and maintainability.
 */
export function applyEffects(
    currentState: GameState,
    result: ResolutionResult,
    effectManager?: EffectManager
): GameState {
    const applier = getEffectApplier();
    return applier.applyEffects(currentState, result, effectManager);
}
