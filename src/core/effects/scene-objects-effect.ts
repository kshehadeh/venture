import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects, ObjectDefinition, CharacterState } from '../types';
import { findItemInInventory, getAllItemsWithContainers } from '../container';

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
            // Get character before inventory is modified (character in context is the original)
            const charInstance = character instanceof CharacterState ? character : new CharacterState(character);
            
            // Build objects map from character's inventory to find full object definitions
            const objectsMap: Record<string, ObjectDefinition> = {};
            for (const entry of charInstance.inventory) {
                if (entry.objectData) {
                    objectsMap[entry.id] = entry.objectData;
                }
            }
            
            // Also add items from containers' contains arrays
            for (const entry of charInstance.inventory) {
                if (entry.objectData?.traits.includes('container') && entry.objectData.contains) {
                    for (const item of entry.objectData.contains) {
                        if (!objectsMap[item.id]) {
                            objectsMap[item.id] = item;
                        }
                    }
                }
                // Also check slots
                if (entry.objectData?.slots) {
                    for (const slot of entry.objectData.slots) {
                        if (slot.itemId) {
                            // Try to find the item in objectsMap or in other containers
                            if (!objectsMap[slot.itemId]) {
                                // Search for it in other containers
                                for (const otherEntry of charInstance.inventory) {
                                    if (otherEntry.objectData?.contains) {
                                        const found = otherEntry.objectData.contains.find(i => i.id === slot.itemId);
                                        if (found) {
                                            objectsMap[slot.itemId] = found;
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // For each item being removed, find its full definition and add to scene
            for (const item of effects.removeItems) {
                // Try to find the item in inventory
                const itemResult = findItemInInventory(charInstance.inventory, item.id);
                let objectDef: ObjectDefinition | null = null;
                
                if (itemResult) {
                    objectDef = itemResult.item;
                } else {
                    // Try to find in objectsMap
                    objectDef = objectsMap[item.id] || null;
                    
                    // If still not found, try fuzzy matching
                    if (!objectDef) {
                        const allItems = getAllItemsWithContainers(charInstance.inventory, objectsMap);
                        const matchingItem = allItems.find(({ item: invItem }) => 
                            invItem.id.toLowerCase() === item.id.toLowerCase() ||
                            invItem.description.toLowerCase().includes(item.id.toLowerCase())
                        );
                        if (matchingItem) {
                            objectDef = matchingItem.item;
                        }
                    }
                }
                
                if (objectDef) {
                    // Create a clean object definition for the scene (without container-specific data)
                    const sceneObject: ObjectDefinition = {
                        id: objectDef.id,
                        quantity: item.quantity || objectDef.quantity || 1,
                        weight: objectDef.weight,
                        perception: objectDef.perception,
                        removable: objectDef.removable,
                        description: objectDef.description,
                        traits: objectDef.traits.filter(t => t !== 'container' || !objectDef.contains), // Keep container trait if it has contains
                        statModifiers: objectDef.statModifiers,
                        carryEffects: objectDef.carryEffects,
                        viewEffects: objectDef.viewEffects,
                        proximityEffect: objectDef.proximityEffect,
                        // Don't include contains or slots when dropping - items should be dropped separately
                        // If the container itself is being dropped, it should be empty
                        contains: objectDef.contains && objectDef.contains.length > 0 ? [] : undefined,
                        slots: undefined, // Clear slots when dropping
                        maxWeight: objectDef.maxWeight,
                        maxItems: objectDef.maxItems,
                        width: objectDef.width,
                        height: objectDef.height,
                        depth: objectDef.depth,
                        detailedDescriptions: objectDef.detailedDescriptions
                    };
                    
                    context.nextState = context.nextState.addSceneObject(currentState.currentSceneId, sceneObject);
                }
            }
        }
    }
}

