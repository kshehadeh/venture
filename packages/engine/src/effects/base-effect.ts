import { GameState, ActionEffects, CharacterState } from '../types';
import { EffectManager } from '../effects';
import { StatCalculator } from '../stats';

/**
 * Context passed to effect classes during application
 */
export interface EffectContext {
    currentState: GameState;
    nextState: GameState;
    effects: ActionEffects;
    actorId: string;
    character: CharacterState;
    effectManager?: EffectManager;
    statCalculator: StatCalculator;
    nextSceneId?: string | null;
    // Object definitions for items referenced in effects (populated before removal/addition)
    // This allows effects to access full object definitions even after InventoryEffect modifies inventory
    targetObjects?: Record<string, import('../game-object').GameObject>;
    // Map of effect IDs to their source information (for effects that need to be removed when source changes)
    effectSources?: Map<string, { type: 'carryEffect' | 'proximityEffect', objectId: string, sceneId?: string }>;
    // Objects that are targets of effects (for object targets)
    targetObjectsMap?: Record<string, import('../game-object').GameObject>;
}

/**
 * Base class for all effect types.
 * Each effect type should extend this class and implement the apply method.
 * 
 * Effects should call mutation methods on state objects and assign the returned
 * new instances back to the context (e.g., `context.character = context.character.updateBaseStats(...)`,
 * `context.nextState = context.nextState.setCurrentScene(...)`).
 */
export abstract class BaseEffect {
    /**
     * Apply this effect to the game state.
     * Effects should call mutation methods on state objects and assign the returned
     * new instances back to the context.
     */
    abstract apply(context: EffectContext): void;

    /**
     * Check if this effect should be applied based on the ActionEffects.
     * Override this if the effect has specific conditions.
     */
    shouldApply(_effects: ActionEffects): boolean {
        return true;
    }

    /**
     * Resolve the target from effects or default to character.
     * Returns the target type and ID, or null if no target specified (defaults to character).
     */
    protected resolveTarget(context: EffectContext): { type: string; id?: string } | null {
        if (context.effects.target) {
            return {
                type: context.effects.target.type,
                id: context.effects.target.id
            };
        }
        // Default to character target
        return { type: 'character', id: context.actorId };
    }

    /**
     * Get target objects for object-type targets.
     * Searches both scene objects and inventory.
     */
    protected getTargetObjects(context: EffectContext, objectId?: string): import('../game-object').GameObject[] {
        const objects: import('../game-object').GameObject[] = [];
        
        if (!objectId) {
            // If no object ID specified, return all objects in current scene
            const currentSceneObjects = context.nextState.sceneObjects[context.nextState.currentSceneId] || [];
            return [...currentSceneObjects];
        }

        // Search in current scene
        const currentSceneObjects = context.nextState.sceneObjects[context.nextState.currentSceneId] || [];
        const sceneObject = currentSceneObjects.find(obj => obj.id === objectId);
        if (sceneObject) {
            objects.push(sceneObject);
        }

        // Search in inventory
        for (const entry of context.character.inventory) {
            if (entry.id === objectId && entry.objectData) {
                objects.push(entry.objectData);
            }
            // Also search in containers
            if (entry.objectData && entry.objectData.contains) {
                const found = this.findObjectInContainer(entry.objectData, objectId);
                if (found) {
                    objects.push(found);
                }
            }
        }

        return objects;
    }

    /**
     * Recursively find an object in a container and its nested containers.
     */
    private findObjectInContainer(container: import('../game-object').GameObject, objectId: string): import('../game-object').GameObject | null {
        if (container.contains) {
            for (const obj of container.contains) {
                if (obj.id === objectId) {
                    return obj;
                }
                if (obj.contains) {
                    const found = this.findObjectInContainer(obj, objectId);
                    if (found) {
                        return found;
                    }
                }
            }
        }
        return null;
    }
}

