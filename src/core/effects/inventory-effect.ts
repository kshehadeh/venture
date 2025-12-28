import { BaseEffect, EffectContext } from './base-effect';
import { ActionEffects, ObjectDefinition, CharacterState } from '../types';
import { findContainerInInventory } from '../container';

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

        // Remove items first (simpler operation)
        if (effects.removeItems) {
            for (const item of effects.removeItems) {
                charInstance = charInstance.removeFromInventory(item.id, item.quantity);
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

