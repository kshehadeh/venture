import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects, CharacterState } from '../types';
import { findItemInInventory } from '../container';
import { GameObject } from '../game-object';

/**
 * Effect that manages scene objects:
 * - Removes objects from sceneObjects when they are picked up (addItems)
 * - Adds objects to sceneObjects when they are dropped (removeItems)
 */
export class SceneObjectsEffect extends BaseEffect {
    shouldApply(effects: ActionEffects): boolean {
        return !!(effects.addItems && effects.addItems.length > 0) ||
               !!(effects.removeItems && effects.removeItems.length > 0);
    }

    apply(context: EffectContext): void {
        const { effects, currentState, nextState, character } = context;
        
        // Handle pickup: remove objects from scene when added to inventory
        if (effects.addItems && nextState.sceneObjects[currentState.currentSceneId]) {
            for (const item of effects.addItems) {
                context.nextState = context.nextState.removeSceneObject(currentState.currentSceneId, item.id);
            }
        }

        // Handle drop: add objects to scene when removed from inventory
        if (effects.removeItems) {
            // Use targetObjects from context (populated by InventoryEffect before removal)
            // This ensures we have the full object definition even after the item is removed from inventory
            const targetObjects = context.targetObjects || {};
            
            // For each item being removed, get its full definition and add to scene
            for (const item of effects.removeItems) {
                // First try to get from targetObjects (most reliable, populated before removal)
                let objectDef: GameObject | null = targetObjects[item.id] || null;
                
                // Fallback: if not in targetObjects, try to find in current character inventory
                // (this handles edge cases where InventoryEffect didn't populate targetObjects)
                if (!objectDef) {
                    const charInstance = character instanceof CharacterState ? character : new CharacterState(character);
                    const itemResult = findItemInInventory(charInstance.inventory, item.id);
                    if (itemResult) {
                        objectDef = itemResult.item;
                    }
                }
                
                if (objectDef) {
                    // Create a clean object for the scene (without container-specific data)
                    // Clone the object and clear contains/slots when dropping
                    const sceneObjectData = objectDef.toJSON();
                    sceneObjectData.quantity = item.quantity || sceneObjectData.quantity || 1;
                    // Don't include contains or slots when dropping - items should be dropped separately
                    // If the container itself is being dropped, it should be empty
                    sceneObjectData.contains = sceneObjectData.contains && sceneObjectData.contains.length > 0 ? [] : undefined;
                    sceneObjectData.slots = undefined; // Clear slots when dropping
                    // Keep container trait only if it has contains (but we just cleared it, so remove it)
                    if (sceneObjectData.traits.includes('container') && !sceneObjectData.contains) {
                        sceneObjectData.traits = sceneObjectData.traits.filter(t => t !== 'container');
                    }
                    
                    const sceneObject = GameObject.fromJSON(sceneObjectData);
                    context.nextState = context.nextState.addSceneObject(currentState.currentSceneId, sceneObject);
                }
            }
        }
    }
}

