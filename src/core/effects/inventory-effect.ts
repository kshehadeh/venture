import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects, ObjectDefinition, CharacterState } from '../types';
import { findContainerInInventory, findItemInInventory } from '../container';

/**
 * Effect that adds or removes items from character inventory.
 */
export class InventoryEffect extends BaseEffect {
    shouldApply(effects: ActionEffects): boolean {
        return !!(effects.addItems && effects.addItems.length > 0) ||
               !!(effects.removeItems && effects.removeItems.length > 0);
    }

    apply(context: EffectContext): void {
        const { effects, character, currentState, nextState } = context;
        
        if (!effects.addItems && !effects.removeItems) {
            return;
        }

        // Ensure character is a CharacterState instance
        let charInstance = character instanceof CharacterState ? character : new CharacterState(character);

        // Remove items first
        if (effects.removeItems) {
            // Build objects map to preserve object definitions before removal
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
            
            // Preserve object definitions for items being removed
            const targetObjects: Record<string, ObjectDefinition> = {};
            for (const item of effects.removeItems) {
                // Try to find the item in inventory to get its full definition
                const itemResult = findItemInInventory(charInstance.inventory, item.id);
                if (itemResult) {
                    targetObjects[item.id] = itemResult.item;
                } else if (objectsMap[item.id]) {
                    targetObjects[item.id] = objectsMap[item.id];
                }
            }
            
            // Store in context for other effects to use
            context.targetObjects = targetObjects;
            
            for (const item of effects.removeItems) {
                // Find where the item is located (top-level inventory, container, or slot)
                const itemResult = findItemInInventory(charInstance.inventory, item.id);
                
                if (itemResult && itemResult.containerId) {
                    // Item is in a container - remove from container's contains array or slot
                    charInstance = charInstance.updateInventory(inventory => {
                        const newInventory = [...inventory];
                        const containerEntry = newInventory.find(e => e.id === itemResult.containerId);
                        
                        if (containerEntry && containerEntry.objectData) {
                            const containerIndex = newInventory.indexOf(containerEntry);
                            
                            if (itemResult.slotId) {
                                // Remove from slot
                                const slots = [...(containerEntry.objectData.slots || [])];
                                const slotIndex = slots.findIndex(s => s.id === itemResult.slotId);
                                if (slotIndex >= 0) {
                                    slots[slotIndex] = {
                                        ...slots[slotIndex],
                                        itemId: null
                                    };
                                    newInventory[containerIndex] = {
                                        ...containerEntry,
                                        objectData: {
                                            ...containerEntry.objectData,
                                            slots: slots
                                        }
                                    };
                                }
                            } else {
                                // Remove from container's contains array
                                const contains = [...(containerEntry.objectData.contains || [])];
                                const itemIndex = contains.findIndex(i => i.id === item.id);
                                if (itemIndex >= 0) {
                                    contains.splice(itemIndex, 1);
                                    newInventory[containerIndex] = {
                                        ...containerEntry,
                                        objectData: {
                                            ...containerEntry.objectData,
                                            contains: contains
                                        }
                                    };
                                }
                            }
                        }
                        
                        return newInventory;
                    });
                } else {
                    // Item is in top-level inventory
                    charInstance = charInstance.removeFromInventory(item.id, item.quantity);
                }
            }
        }

        // Add items (more complex, may need to add to containers)
        if (effects.addItems) {
            for (const item of effects.addItems) {
                // Look up object definition from current scene (before it's removed)
                const sceneObjList = nextState.sceneObjects[currentState.currentSceneId] || [];
                const objectDef = sceneObjList.find(obj => obj.id === item.id) || item.objectData;
                
                if (!objectDef) continue;
                
                const isContainer = objectDef.traits && objectDef.traits.includes('container');
                let addedToContainer = false;
                
                // For non-containers, try to find a container
                if (!isContainer) {
                    const objectsMap: Record<string, ObjectDefinition> = {};
                    for (const entry of charInstance.inventory) {
                        if (entry.objectData) {
                            objectsMap[entry.id] = entry.objectData;
                        }
                    }
                    
                    const container = findContainerInInventory(charInstance.inventory, objectDef, objectsMap);
                    
                    if (container) {
                        // Add to container's contains array using updateInventory
                        charInstance = charInstance.updateInventory(inventory => {
                            const newInventory = [...inventory];
                            const containerEntry = newInventory.find(e => e.id === container.id);
                            if (containerEntry && containerEntry.objectData) {
                                const containerIndex = newInventory.indexOf(containerEntry);
                                newInventory[containerIndex] = {
                                    ...containerEntry,
                                    objectData: {
                                        ...containerEntry.objectData,
                                        contains: [...(containerEntry.objectData.contains || []), objectDef]
                                    }
                                };
                            }
                            return newInventory;
                        });
                        addedToContainer = true;
                    }
                }
                
                // If not added to any container, add to regular inventory (for containers themselves)
                if (!addedToContainer) {
                    charInstance = charInstance.addToInventory(item, isContainer ? objectDef : item.objectData);
                }
            }
        }

        context.character = charInstance;
    }
}

