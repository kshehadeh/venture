import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult } from '../types';
import type { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { getAllItemsWithContainers } from '../container';
import { ParsedCommand } from '../utils/nlp-parser';

export class InventoryCommand implements Command {
    getCommandId(): string {
        return 'items';
    }

    matchesIntent(intent: ActionIntent): boolean {
        return intent.type === this.getCommandId();
    }

    getAliases(): { singleWords: string[]; phrasalVerbs: string[] } {
        return {
            singleWords: ['items', 'inventory', 'inv', 'i', 'bag', 'stuff'],
            phrasalVerbs: []
        };
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({}); // No parameters
    }

    processProcedural(_parsed: ParsedCommand, _input: string, _context: SceneContext): NormalizedCommandInput | null {
        // Items command has no parameters
        return {
            commandId: 'items',
            parameters: {}
        };
    }

    execute(input: NormalizedCommandInput, context: SceneContext, originalInput?: string): ActionIntent {
        logger.log('[InventoryCommand] Executing with input:', JSON.stringify(input, null, 2));
        const intent = {
            actorId: 'player',
            type: 'items' as const,
            sceneId: context.id,
            originalInput: originalInput
        };
        logger.log('[InventoryCommand] ActionIntent created:', JSON.stringify(intent, null, 2));
        return intent;
    }

    resolve(state: GameState, intent: ActionIntent, _context: SceneContext): ResolutionResult {
        const character = state.characters[intent.actorId || 'player'];
        if (!character) {
            return {
                outcome: 'failure',
                narrativeResolver: "Character not found.",
                effects: undefined
            };
        }
        logger.log('[InventoryCommand] Resolving - inventory length:', character.inventory.length);
        
        // Format container names for display
        const formatContainerName = (containerId: string): string => {
            if (containerId === 'left-hand') return 'left hand';
            if (containerId === 'right-hand') return 'right hand';
            return containerId;
        };
        
        // Build comprehensive objects map for looking up slot items
        // This includes items from inventory entries, containers' contains arrays, and scene objects
        const objectsMap: Record<string, import('../types').ObjectDefinition> = {};
        
        // Add items from inventory entries
        for (const entry of character.inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
            }
        }
        
        // Add items from containers' contains arrays (recursively)
        const addContainerItems = (container: import('../types').ObjectDefinition) => {
            if (container.contains) {
                for (const item of container.contains) {
                    if (!objectsMap[item.id]) {
                        objectsMap[item.id] = item;
                    }
                    // Recursively add nested container items
                    if (item.traits.includes('container')) {
                        addContainerItems(item);
                    }
                }
            }
        };
        
        for (const entry of character.inventory) {
            if (entry.objectData?.traits.includes('container')) {
                addContainerItems(entry.objectData);
            }
        }
        
        // Also add scene objects for items that might be in slots (e.g., just picked up)
        const sceneObjects = state.sceneObjects[state.currentSceneId] || [];
        for (const obj of sceneObjects) {
            if (!objectsMap[obj.id]) {
                objectsMap[obj.id] = obj;
            }
        }
        
        // Also check all scene objects from all scenes (items might have been picked up from other scenes)
        for (const sceneId in state.sceneObjects) {
            for (const obj of state.sceneObjects[sceneId]) {
                if (!objectsMap[obj.id]) {
                    objectsMap[obj.id] = obj;
                }
            }
        }
        
        // Also search for items that are referenced in slots but might not be in objectsMap yet
        // This can happen if an item was transferred to a slot but its definition isn't in scene objects
        for (const entry of character.inventory) {
            if (entry.objectData?.slots) {
                for (const slot of entry.objectData.slots) {
                    if (slot.itemId && !objectsMap[slot.itemId]) {
                        // Try to find the item in any container's contains array
                        for (const otherEntry of character.inventory) {
                            if (otherEntry.objectData?.contains) {
                                const found = otherEntry.objectData.contains.find(item => item.id === slot.itemId);
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
        
        // Get items with slot information (including items in slots)
        const itemsWithSlots = getAllItemsWithContainers(character.inventory, objectsMap);
        
        let narrative = '';
        if (itemsWithSlots.length === 0) {
            narrative = "You are not carrying anything.";
        } else {
            
            narrative = "Inventory:\n" + itemsWithSlots
                .map(({ item, container, slot }) => {
                    const quantity = item.quantity && item.quantity > 1 ? ` (x${item.quantity})` : '';
                    let locationInfo = '';
                    if (container) {
                        const containerName = formatContainerName(container);
                        if (slot) {
                            // Find slot name for display
                            const containerEntry = character.inventory.find(e => e.id === container);
                            const slotDef = containerEntry?.objectData?.slots?.find(s => s.id === slot);
                            const slotName = slotDef?.name || slot;
                            locationInfo = ` (${containerName}, ${slotName} slot)`;
                        } else {
                            locationInfo = ` (${containerName})`;
                        }
                    }
                    return `  - ${item.id}${quantity}${locationInfo}`;
                })
                .join('\n');
        }
        
        logger.log('[InventoryCommand] Generated narrative:', narrative);
        
        return {
            outcome: 'success',
            narrativeResolver: narrative,
            effects: undefined,
            nextSceneId: undefined
        };
    }
}

