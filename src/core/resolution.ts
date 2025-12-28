import {
    GameState,
    ActionIntent,
    ResolutionResult,
    ActionEffects,
    CharacterState,
    StatBlock,
    InventoryEntry,
    ObjectDefinition
} from "./types";
import { findContainerInInventory } from "./container";
import { StatCalculator } from "./stats";
import { EffectManager } from "./effects";

// We need an interface for the Choice Definition to know what effects to apply.
// This mirrors the structure in schema.md but as a TS interface.
// Ideally this comes from a shared 'content' type definition, but we define the subset here for the engine.
export interface ChoiceDefinition {
    id: string;
    text?: string;
    aliases?: string[];
    requirements?: any; // Handled by validation
    effects?: ActionEffects;
    nextSceneId?: string | null;
}


/**
 * Pure function to apply effects to a state and return a NEW state (immutable-ish).
 * Note: deep cloning is expensive, so we might do shallow copies where needed.
 * For this implementation, we will perform structural sharing updates.
 */
export function applyEffects(
    currentState: GameState,
    result: ResolutionResult,
    effectManager?: EffectManager
): GameState {
    if (result.outcome === 'failure') {
        return currentState; // No changes on failure? Or partial?
    }

    const effects = result.effects || {};
    const nextState = { ...currentState };
    nextState.characters = { ...currentState.characters }; // Clone characters
    nextState.world = { ...currentState.world };
    nextState.sceneObjects = { ...currentState.sceneObjects }; // Clone sceneObjects

    // Get the actor character (default to player)
    const actorId = effects.targetCharacterId || 'player';
    const char = nextState.characters[actorId];
    if (!char) {
        return nextState; // Character not found
    }

    let updatedChar = { ...char };

    // 1. Stats - update baseStats (not current stats)
    if (effects.stats) {
        updatedChar.baseStats = { ...updatedChar.baseStats };
        for (const [key, delta] of Object.entries(effects.stats)) {
            const k = key as keyof StatBlock;
            updatedChar.baseStats[k] = (updatedChar.baseStats[k] || 0) + delta;
        }
    }

    // 2. Traits
    if (effects.addTraits || effects.removeTraits) {
        updatedChar.traits = new Set(updatedChar.traits);
        effects.addTraits?.forEach(t => updatedChar.traits.add(t));
        effects.removeTraits?.forEach(t => updatedChar.traits.delete(t));
    }

    // 3. Flags
    // Use effects.addFlags to mostly likely set Global flags or Char flags?
    // Schema says "ChoiceEffect... addFlags".
    // Let's modify World flags by default for now, or Character flags? 
    // Let's do BOTH for flexibility? Or define a convention?
    // Architecture "WorldState... globalFlags". Let's stick to World flags for narrative flags.
    if (effects.addFlags || effects.removeFlags) {
        nextState.world.globalFlags = new Set(nextState.world.globalFlags);
        effects.addFlags?.forEach(f => nextState.world.globalFlags.add(f));
        effects.removeFlags?.forEach(f => nextState.world.globalFlags.delete(f));
    }

    // 3. Effects (apply/remove effects through EffectManager)
    if (effectManager) {
        if (effects.addEffects) {
            for (const effectId of effects.addEffects) {
                updatedChar = effectManager.applyEffect(updatedChar, effectId);
            }
        }
        if (effects.removeEffects) {
            for (const effectId of effects.removeEffects) {
                updatedChar = effectManager.removeEffect(updatedChar, effectId);
            }
        }
    }

    // 4. Inventory
    if (effects.addItems || effects.removeItems) {
        updatedChar.inventory = [...updatedChar.inventory];

        // Add
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
                    for (const entry of updatedChar.inventory) {
                        if (entry.objectData) {
                            objectsMap[entry.id] = entry.objectData;
                        }
                    }
                    
                    const container = findContainerInInventory(updatedChar.inventory, objectDef, objectsMap);
                    
                    if (container) {
                        // Add to container's contains array
                        const containerEntry = updatedChar.inventory.find(e => e.id === container.id);
                        if (containerEntry && containerEntry.objectData) {
                            containerEntry.objectData = {
                                ...containerEntry.objectData,
                                contains: [...(containerEntry.objectData.contains || []), objectDef]
                            };
                            addedToContainer = true;
                        }
                    }
                }
                
                // If not added to any container, add to regular inventory (for containers themselves)
                if (!addedToContainer) {
                    const existingIdx = updatedChar.inventory.findIndex(i => i.id === item.id);
                    if (existingIdx >= 0) {
                        const existing = updatedChar.inventory[existingIdx];
                        updatedChar.inventory[existingIdx] = { 
                            ...existing, 
                            quantity: existing.quantity + item.quantity,
                            objectData: isContainer ? objectDef : (item.objectData || existing.objectData)
                        };
                    } else {
                        updatedChar.inventory.push({ 
                            ...item, 
                            objectData: isContainer ? objectDef : item.objectData 
                        });
                    }
                }
            }
        }

        // Remove
        if (effects.removeItems) {
            for (const item of effects.removeItems) {
                const existingIdx = updatedChar.inventory.findIndex(i => i.id === item.id);
                if (existingIdx >= 0) {
                    const existing = updatedChar.inventory[existingIdx];
                    const newQty = existing.quantity - item.quantity;
                    if (newQty <= 0) {
                        updatedChar.inventory.splice(existingIdx, 1);
                    } else {
                        updatedChar.inventory[existingIdx] = { ...existing, quantity: newQty };
                    }
                }
            }
        }
    }

    // 4.5. Transfer Item
    if (effects.transferItem) {
        updatedChar.inventory = [...updatedChar.inventory];
        const { itemId, fromContainerId, toContainerId } = effects.transferItem;

        // Find the item in its current location
        let item: ObjectDefinition | null = null;
        let fromContainerEntry: InventoryEntry | null = null;
        let itemIndexInContainer: number = -1;

        if (fromContainerId === null) {
            // Item is directly in inventory (not in a container)
            const itemEntry = updatedChar.inventory.find(entry => entry.id === itemId);
            if (itemEntry && itemEntry.objectData) {
                item = itemEntry.objectData;
            }
        } else {
            // Item is in a container
            fromContainerEntry = updatedChar.inventory.find(entry => entry.id === fromContainerId) || null;
            if (fromContainerEntry && fromContainerEntry.objectData) {
                const contains = fromContainerEntry.objectData.contains || [];
                itemIndexInContainer = contains.findIndex(obj => obj.id === itemId);
                if (itemIndexInContainer >= 0) {
                    item = contains[itemIndexInContainer];
                }
            }
        }

        if (!item) {
            // Item not found - this shouldn't happen if validation was correct, but handle gracefully
            return nextState;
        }

        // Find destination container
        const toContainerEntry = updatedChar.inventory.find(entry => entry.id === toContainerId);
        if (!toContainerEntry || !toContainerEntry.objectData) {
            // Destination container not found - shouldn't happen, but handle gracefully
            return nextState;
        }

        // Remove item from current location
        if (fromContainerId === null) {
            // Remove from direct inventory
            const itemEntryIndex = updatedChar.inventory.findIndex(entry => entry.id === itemId);
            if (itemEntryIndex >= 0) {
                updatedChar.inventory.splice(itemEntryIndex, 1);
            }
        } else {
            // Remove from container's contains array
            if (fromContainerEntry && fromContainerEntry.objectData) {
                const contains = [...(fromContainerEntry.objectData.contains || [])];
                contains.splice(itemIndexInContainer, 1);
                fromContainerEntry.objectData = {
                    ...fromContainerEntry.objectData,
                    contains: contains
                };
            }
        }

        // Add item to destination container
        const toContainer = toContainerEntry.objectData;
        const toContains = [...(toContainer.contains || [])];
        toContains.push(item);
        toContainerEntry.objectData = {
            ...toContainer,
            contains: toContains
        };
    }

    // Scene Transition
    if (result.nextSceneId !== undefined) {
        // If null, it means end game, but we store it.
        // Ensure we handle null in the Engine loop.
        if (result.nextSceneId !== null) {
            nextState.currentSceneId = result.nextSceneId;
        }
        // else: game over state? existing scene? 
        // Types say nextSceneId: string | null.
        // GameState.currentSceneId is string.
        // We might need an END_GAME_ID or similar, or handle null in logic.
        // For now, if null, don't update currentSceneId? Or have a special "END"?
        // Let's assume the Engine handles the loop termination if nextSceneId is null.
        // The state update should probably reflect the *intent* to transition.
    }

    // 5. Remove objects from sceneObjects if they were picked up
    // Check if addItems contains objects that exist in current scene
    if (effects.addItems && nextState.sceneObjects[currentState.currentSceneId]) {
        const sceneObjList = [...nextState.sceneObjects[currentState.currentSceneId]];
        for (const item of effects.addItems) {
            const objIndex = sceneObjList.findIndex(obj => obj.id === item.id);
            if (objIndex >= 0) {
                sceneObjList.splice(objIndex, 1);
            }
        }
        if (sceneObjList.length === 0) {
            delete nextState.sceneObjects[currentState.currentSceneId];
        } else {
            nextState.sceneObjects[currentState.currentSceneId] = sceneObjList;
        }
    }

    // Mark visited
    nextState.world.visitedScenes = new Set(nextState.world.visitedScenes);
    nextState.world.visitedScenes.add(currentState.currentSceneId); // Mark PREVIOUS scene as visited? Or new?
    // Usually mark the scene we just LEFT, or the one we just ENTERED?
    // Logic: "visitedScenes". If I am in "intro", and go to "crossroads". "intro" is visited.
    if (nextState.currentSceneId !== currentState.currentSceneId) {
        nextState.world.visitedScenes.add(currentState.currentSceneId);
    }

    // Update character in characters record
    nextState.characters[actorId] = updatedChar;

    // Recalculate current stats for the updated character
    const statCalculator = new StatCalculator();
    const objectsMap: Record<string, ObjectDefinition> = {};
    for (const entry of updatedChar.inventory) {
        if (entry.objectData) {
            objectsMap[entry.id] = entry.objectData;
        }
    }
    nextState.characters[actorId] = statCalculator.updateCharacterStats(
        nextState.characters[actorId],
        objectsMap
    );

    return nextState;
}
