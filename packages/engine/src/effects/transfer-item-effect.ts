import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects, ObjectDefinition, CharacterState, InventoryEntry } from '../types';

/**
 * Effect that transfers an item between containers or from inventory to container.
 */
export class TransferItemEffect extends BaseEffect {
    shouldApply(effects: ActionEffects): boolean {
        return !!effects.transferItem;
    }

    apply(context: EffectContext): void {
        const { effects, character, nextState } = context;
        
        if (!effects.transferItem) {
            return;
        }

        // Ensure character is a CharacterState instance
        let charInstance = character instanceof CharacterState ? character : new CharacterState(character);
        const { itemId, fromContainerId, toContainerId, slotId } = effects.transferItem;

        // Build comprehensive objects map for looking up items in slots
        const objectsMap: Record<string, ObjectDefinition> = {};
        for (const entry of charInstance.inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
                // Also add items from containers' contains arrays
                if (entry.objectData.contains) {
                    for (const item of entry.objectData.contains) {
                        objectsMap[item.id] = item;
                    }
                }
            }
        }
        // Also add scene objects
        for (const sceneId in nextState.sceneObjects) {
            for (const obj of nextState.sceneObjects[sceneId]) {
                if (!objectsMap[obj.id]) {
                    objectsMap[obj.id] = obj;
                }
            }
        }

        // Find the item in its current location
        let item: ObjectDefinition | null = null;
        let fromContainerEntry: InventoryEntry | null = null;
        let itemIndexInContainer: number = -1;
        let fromSlotIndex: number = -1;

        if (fromContainerId === null) {
            // Item is directly in inventory (not in a container)
            const itemEntry = charInstance.inventory.find(entry => entry.id === itemId);
            if (itemEntry && itemEntry.objectData) {
                item = itemEntry.objectData;
            }
        } else {
            // Item is in a container - check both general storage and slots
            fromContainerEntry = charInstance.inventory.find(entry => entry.id === fromContainerId) || null;
            if (fromContainerEntry && fromContainerEntry.objectData) {
                // First check general storage (contains array)
                const contains = fromContainerEntry.objectData.contains || [];
                itemIndexInContainer = contains.findIndex(obj => obj.id === itemId);
                if (itemIndexInContainer >= 0) {
                    item = contains[itemIndexInContainer];
                } else {
                    // Check slots
                    if (fromContainerEntry.objectData.slots) {
                        for (let i = 0; i < fromContainerEntry.objectData.slots.length; i++) {
                            const slot = fromContainerEntry.objectData.slots[i];
                            if (slot.itemId === itemId) {
                                // Item is in a slot - look it up from objectsMap or scene
                                const slotItem = objectsMap[itemId];
                                if (slotItem) {
                                    item = slotItem;
                                } else {
                                    // Try to find in scene objects
                                    const sceneObjList = nextState.sceneObjects[nextState.currentSceneId] || [];
                                    const sceneItem = sceneObjList.find(obj => obj.id === itemId);
                                    if (sceneItem) {
                                        item = sceneItem;
                                    }
                                }
                                fromSlotIndex = i;
                                break;
                            }
                        }
                    }
                }
            }
        }

        if (!item) {
            // Item not found - this shouldn't happen if validation was correct, but handle gracefully
            context.character = charInstance;
            return;
        }

        // Find destination container
        const toContainerEntry = charInstance.inventory.find(entry => entry.id === toContainerId);
        if (!toContainerEntry || !toContainerEntry.objectData) {
            // Destination container not found - shouldn't happen, but handle gracefully
            context.character = charInstance;
            return;
        }

        // Use updateInventory to perform the transfer
        charInstance = charInstance.updateInventory(inventory => {
            const newInventory = [...inventory];
            
            // Remove item from current location
            if (fromContainerId === null) {
                // Remove from direct inventory
                const itemEntryIndex = newInventory.findIndex(entry => entry.id === itemId);
                if (itemEntryIndex >= 0) {
                    newInventory.splice(itemEntryIndex, 1);
                }
            } else {
                // Remove from container
                const fromContainerIndex = newInventory.findIndex(entry => entry.id === fromContainerId);
                if (fromContainerIndex >= 0) {
                    const fromContainer = newInventory[fromContainerIndex];
                    if (fromContainer.objectData) {
                        if (fromSlotIndex >= 0) {
                            // Remove from slot
                            const slots = [...(fromContainer.objectData.slots || [])];
                            slots[fromSlotIndex] = {
                                ...slots[fromSlotIndex],
                                itemId: null
                            };
                            newInventory[fromContainerIndex] = {
                                ...fromContainer,
                                objectData: {
                                    ...fromContainer.objectData,
                                    slots: slots
                                }
                            };
                        } else {
                            // Remove from container's contains array
                            const contains = [...(fromContainer.objectData.contains || [])];
                            contains.splice(itemIndexInContainer, 1);
                            newInventory[fromContainerIndex] = {
                                ...fromContainer,
                                objectData: {
                                    ...fromContainer.objectData,
                                    contains: contains
                                }
                            };
                        }
                    }
                }
            }

            // Add item to destination container
            const toContainerIndex = newInventory.findIndex(entry => entry.id === toContainerId);
            if (toContainerIndex >= 0) {
                const toContainer = newInventory[toContainerIndex];
                if (toContainer.objectData) {
                    if (slotId) {
                        // Add to specific slot
                        const slots = [...(toContainer.objectData.slots || [])];
                        const slotIndex = slots.findIndex(s => s.id === slotId);
                        if (slotIndex >= 0) {
                            slots[slotIndex] = {
                                ...slots[slotIndex],
                                itemId: itemId
                            };
                            newInventory[toContainerIndex] = {
                                ...toContainer,
                                objectData: {
                                    ...toContainer.objectData,
                                    slots: slots
                                }
                            };
                        }
                    } else {
                        // Add to general storage (contains array)
                        const toContains = [...(toContainer.objectData.contains || [])];
                        toContains.push(item);
                        newInventory[toContainerIndex] = {
                            ...toContainer,
                            objectData: {
                                ...toContainer.objectData,
                                contains: toContains
                            }
                        };
                    }
                }
            }

            return newInventory;
        });

        context.character = charInstance;
    }
}

