import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult, ActionEffects, SlotDefinition } from '../types';
import { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { findItemInInventory, canFitInContainer, findContainerInInventoryFuzzy, findSlotInContainer, canFitInSlot } from '../container';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';

export class TransferCommand implements Command {
    getCommandId(): string {
        return 'transfer';
    }

    matchesIntent(intent: ActionIntent): boolean {
        return intent.type === this.getCommandId();
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({
            itemId: z.string().describe('ID of the item to transfer'),
            destinationContainerId: z.string().describe('ID of the destination container')
        });
    }

    async extractParameters(userInput: string, _context: SceneContext): Promise<NormalizedCommandInput | null> {
        logger.log('[TransferCommand] Extracting parameters from input:', userInput);
        
        try {
            const result = await generateObject({
                model: openai('gpt-4o'),
                schema: z.object({
                    itemId: z.string().nullable().describe('The item to transfer (from inventory)'),
                    destinationContainerId: z.string().nullable().describe('The destination container (e.g., "left-hand", "right-hand", "backpack", or container name). May include slot reference like "backpack sheath slot" or "left-hand ring-1"'),
                    confidence: z.number().describe('Confidence level for parameter extraction')
                }),
                system: `
        You are identifying the item and destination for a "transfer" command in a text adventure game.
        
        The player wants to move an item from one container to another. You need to identify:
        1. The item to transfer (from the player's inventory)
        2. The destination container (could be "left-hand", "right-hand", or a container name like "backpack")
        
        Common destination containers:
        - "left-hand" or "left hand"
        - "right-hand" or "right hand"
        - Container names like "backpack", "bag", "pouch", etc.
        
        Slots can be specified:
        - "backpack sheath slot" -> container: "backpack", slot: "sheath"
        - "left-hand ring-1" -> container: "left-hand", slot: "ring-1"
        - "right hand ring finger" -> container: "right-hand", slot: "ring-4"
        
        Examples:
        - "transfer sword to left-hand" -> itemId: "sword", destinationContainerId: "left-hand"
        - "move key to backpack" -> itemId: "key", destinationContainerId: "backpack"
        - "put torch in bag" -> itemId: "torch", destinationContainerId: "bag"
        - "put ring in left-hand ring-1 slot" -> itemId: "ring", destinationContainerId: "left-hand ring-1 slot"
      `,
                prompt: `
        Player Input: "${userInput}"
        
        Identify the item to transfer and the destination container.
        Common destination phrases: "to", "into", "in", "inside"
      `
            });
            
            logger.log('[TransferCommand] Parameter extraction result:', result.object);
            
            if (result.object.itemId && result.object.destinationContainerId && result.object.confidence > 0.5) {
                return {
                    commandId: 'transfer',
                    parameters: {
                        itemId: result.object.itemId,
                        destinationContainerId: result.object.destinationContainerId
                    }
                };
            }
            
            logger.log('[TransferCommand] Missing required parameters or low confidence');
            return null;
        } catch (error) {
            logger.error('[TransferCommand] Failed to extract parameters:', error);
            return null;
        }
    }

    execute(input: NormalizedCommandInput, context: SceneContext, originalInput?: string): ActionIntent {
        logger.log('[TransferCommand] Executing with input:', JSON.stringify(input, null, 2));
        const itemId = input.parameters.itemId;
        const destinationContainerId = input.parameters.destinationContainerId;
        
        if (!itemId || !destinationContainerId) {
            logger.error('[TransferCommand] Missing required parameters');
            throw new Error('Transfer command requires itemId and destinationContainerId parameters');
        }

        logger.log(`[TransferCommand] Transferring ${itemId} to ${destinationContainerId}`);
        const intent = {
            actorId: 'player',
            type: 'transfer' as const,
            sceneId: context.id,
            itemId: itemId,
            targetId: destinationContainerId,
            originalInput: originalInput
        };
        logger.log('[TransferCommand] ActionIntent created:', JSON.stringify(intent, null, 2));
        return intent;
    }

    resolve(state: GameState, intent: ActionIntent, _context: SceneContext): ResolutionResult {
        const itemId = intent.itemId;
        const destinationContainerId = intent.targetId;

        if (!itemId || !destinationContainerId) {
            return {
                outcome: 'failure',
                narrativeResolver: "Transfer what to where?",
                effects: undefined
            };
        }

        // Find the item in inventory
        const character = state.characters[intent.actorId || 'player'];
        if (!character) {
            return {
                outcome: 'failure',
                narrativeResolver: "Character not found.",
                effects: undefined
            };
        }
        const itemLocation = findItemInInventory(character.inventory, itemId);
        if (!itemLocation) {
            return {
                outcome: 'failure',
                narrativeResolver: "I don't see that item in your inventory.",
                effects: undefined
            };
        }

        const item = itemLocation.item;
        const fromContainerId = itemLocation.containerId;

        // Try to extract container name from destination (in case it includes slot info like "backpack sheath slot")
        // Common patterns: "container slot", "container.slot", "container slot-name"
        let containerSearchTerm = destinationContainerId;
        const slotPattern = /\s+(sheath|pocket|ring|slot|\w+\s+slot)/i;
        const slotMatch = destinationContainerId.match(slotPattern);
        if (slotMatch) {
            // Extract just the container part (everything before the slot reference)
            containerSearchTerm = destinationContainerId.substring(0, slotMatch.index).trim();
        }
        
        // Also try splitting on common separators
        if (containerSearchTerm === destinationContainerId) {
            const parts = destinationContainerId.split(/[\s.]/);
            if (parts.length > 1) {
                // Try first part as container name
                containerSearchTerm = parts[0];
            }
        }

        // Find the destination container using fuzzy matching
        const containerMatch = findContainerInInventoryFuzzy(character.inventory, containerSearchTerm);
        if (!containerMatch) {
            return {
                outcome: 'failure',
                narrativeResolver: "That container doesn't exist.",
                effects: undefined
            };
        }

        const actualDestinationContainerId = containerMatch.entry.id;

        // Check if trying to transfer to the same container
        if (fromContainerId === actualDestinationContainerId) {
            const containerName = actualDestinationContainerId === 'left-hand' ? 'your left hand' 
                : actualDestinationContainerId === 'right-hand' ? 'your right hand'
                : actualDestinationContainerId;
            return {
                outcome: 'failure',
                narrativeResolver: `The ${item.id} is already in ${containerName}.`,
                effects: undefined
            };
        }

        const destinationContainer = containerMatch.container;

        // Check if destination is actually a container (should always be true from findContainerInInventoryFuzzy, but double-check)
        if (!destinationContainer.traits.includes('container')) {
            return {
                outcome: 'failure',
                narrativeResolver: "That's not a container.",
                effects: undefined
            };
        }

        // Parse slot ID from destination if present
        // Format could be: "backpack sheath slot", "left-hand ring-1", "backpack.sheath", etc.
        let slotId: string | undefined = undefined;
        const destinationLower = destinationContainerId.toLowerCase();
        const containerIdLower = actualDestinationContainerId.toLowerCase();
        
        // Helper function to find slot by ID or name (case-insensitive)
        const findSlotByIdOrName = (identifier: string): SlotDefinition | null => {
            if (!destinationContainer.slots) {
                return null;
            }
            const identifierLower = identifier.toLowerCase();
            return destinationContainer.slots.find(slot => 
                slot.id.toLowerCase() === identifierLower || 
                (slot.name && slot.name.toLowerCase() === identifierLower)
            ) || null;
        };
        
        // Try to extract slot ID from the destination string
        // Remove container name and look for slot references
        const remaining = destinationLower.replace(containerIdLower, '').trim();
        if (remaining) {
            // Generic patterns to extract slot identifiers
            const slotPatterns = [
                /(\w+)\s*slot/i,  // "sheath slot", "pocket slot"
                /\.(\w+)/i,  // "backpack.sheath"
                /(\w+)/i  // "sheath", "ring-1", etc.
            ];
            
            for (const pattern of slotPatterns) {
                const match = remaining.match(pattern);
                if (match) {
                    const potentialIdentifier = match[1] || match[0];
                    
                    // Try to find matching slot by ID or name
                    const slot = findSlotByIdOrName(potentialIdentifier);
                    if (slot) {
                        slotId = slot.id;
                        break;
                    }
                }
            }
            
            // If no pattern matched, try the remaining text as a direct slot identifier
            if (!slotId && remaining) {
                const normalizedRemaining = remaining.replace(/\s*(slot|finger)\s*/gi, '').trim();
                const slot = findSlotByIdOrName(normalizedRemaining);
                if (slot) {
                    slotId = slot.id;
                }
            }
        }

        // Check if trying to transfer a container into itself or into one of its nested containers
        // First, check if destination is the item itself
        if (destinationContainer.id === itemId) {
            return {
                outcome: 'failure',
                narrativeResolver: "You can't transfer a container into itself.",
                effects: undefined
            };
        }

        // Check if destination is nested inside the item (if item is a container)
        if (item.traits.includes('container')) {
            const checkNested = (container: typeof item, targetId: string): boolean => {
                if (container.id === targetId) return true;
                const contains = container.contains || [];
                for (const contained of contains) {
                    if (contained.id === targetId) return true;
                    if (contained.traits.includes('container')) {
                        if (checkNested(contained, targetId)) return true;
                    }
                }
                return false;
            };
            
            if (checkNested(item, actualDestinationContainerId)) {
                return {
                    outcome: 'failure',
                    narrativeResolver: "You can't transfer a container into one of its nested containers.",
                    effects: undefined
                };
            }
        }

        // Build objects map for weight calculations
        const objectsMap: Record<string, typeof item> = {};
        for (const entry of character.inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
            }
        }
        // Also add scene objects
        const sceneObjects = state.sceneObjects[state.currentSceneId] || [];
        for (const obj of sceneObjects) {
            objectsMap[obj.id] = obj;
        }
        if (item.id && !objectsMap[item.id]) {
            objectsMap[item.id] = item;
        }

        // Handle slot transfer
        if (slotId) {
            const slot = findSlotInContainer(destinationContainer, slotId);
            if (!slot) {
                return {
                    outcome: 'failure',
                    narrativeResolver: `That slot doesn't exist in ${actualDestinationContainerId}.`,
                    effects: undefined
                };
            }
            
            // Check if slot is already occupied
            if (slot.itemId) {
                const slotName = slot.name || slot.id;
                return {
                    outcome: 'failure',
                    narrativeResolver: `The ${slotName} slot is already occupied.`,
                    effects: undefined
                };
            }
            
            // Check if item fits in slot
            if (!canFitInSlot(item, slot, objectsMap)) {
                const slotName = slot.name || slot.id;
                return {
                    outcome: 'failure',
                    narrativeResolver: `The ${item.id} doesn't fit in the ${slotName} slot.`,
                    effects: undefined
                };
            }
            
            // Success - create transfer effect with slotId
            const effects: ActionEffects = {
                transferItem: {
                    itemId: itemId,
                    fromContainerId: fromContainerId,
                    toContainerId: actualDestinationContainerId,
                    slotId: slotId
                }
            };

            const containerName = actualDestinationContainerId === 'left-hand' ? 'left hand' 
                : actualDestinationContainerId === 'right-hand' ? 'right hand'
                : actualDestinationContainerId;
            const slotName = slot.name || slot.id;

            return {
                outcome: 'success',
                narrativeResolver: `You move the ${item.id} to the ${slotName} slot in your ${containerName}.`,
                effects: effects
            };
        }

        // Handle general storage transfer (no slot specified)
        // Get existing items in destination container
        const existingItems = destinationContainer.contains || [];

        // Check if item can fit in destination container
        if (!canFitInContainer(item, destinationContainer, existingItems, objectsMap)) {
            const containerName = actualDestinationContainerId === 'left-hand' ? 'left hand' 
                : actualDestinationContainerId === 'right-hand' ? 'right hand'
                : actualDestinationContainerId;
            return {
                outcome: 'failure',
                narrativeResolver: `The ${item.id} doesn't fit in your ${containerName}.`,
                effects: undefined
            };
        }

        // Success - create transfer effect (use actual container ID)
        const effects: ActionEffects = {
            transferItem: {
                itemId: itemId,
                fromContainerId: fromContainerId,
                toContainerId: actualDestinationContainerId
            }
        };

        const containerName = actualDestinationContainerId === 'left-hand' ? 'left hand' 
            : actualDestinationContainerId === 'right-hand' ? 'right hand'
            : actualDestinationContainerId;

        return {
            outcome: 'success',
            narrativeResolver: `You move the ${item.id} to your ${containerName}.`,
            effects: effects
        };
    }
}

