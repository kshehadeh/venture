import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult, ActionEffects } from '../types';
import { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { findItemInInventory, canFitInContainer, findContainerInInventoryFuzzy } from '../container';

export class TransferCommand implements Command {
    getCommandId(): string {
        return 'transfer';
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({
            itemId: z.string().describe('ID of the item to transfer'),
            destinationContainerId: z.string().describe('ID of the destination container')
        });
    }

    execute(input: NormalizedCommandInput, context: SceneContext): ActionIntent {
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
            type: 'choice' as const,
            choiceId: 'transfer',
            sceneId: context.id,
            itemId: itemId,
            targetId: destinationContainerId
        };
        logger.log('[TransferCommand] ActionIntent created:', JSON.stringify(intent, null, 2));
        return intent;
    }

    resolve(state: GameState, intent: ActionIntent, context: SceneContext): ResolutionResult {
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

        // Find the destination container using fuzzy matching (need to do this early for same-container check)
        const containerMatch = findContainerInInventoryFuzzy(character.inventory, destinationContainerId);
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

        // Get existing items in destination container
        const existingItems = destinationContainer.contains || [];

        // Check if item can fit in destination container
        if (!canFitInContainer(item, destinationContainer, existingItems)) {
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

