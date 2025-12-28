import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult } from '../types';
import { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { getAllItemsWithContainers } from '../container';

export class InventoryCommand implements Command {
    getCommandId(): string {
        return 'items';
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({}); // No parameters
    }

    execute(input: NormalizedCommandInput, context: SceneContext): ActionIntent {
        logger.log('[InventoryCommand] Executing with input:', JSON.stringify(input, null, 2));
        const intent = {
            actorId: 'player',
            type: 'choice' as const,
            choiceId: 'items',
            sceneId: context.id
        };
        logger.log('[InventoryCommand] ActionIntent created:', JSON.stringify(intent, null, 2));
        return intent;
    }

    resolve(state: GameState, intent: ActionIntent, context: SceneContext): ResolutionResult {
        const character = state.characters[intent.actorId || 'player'];
        if (!character) {
            return {
                outcome: 'failure',
                narrativeResolver: "Character not found.",
                effects: undefined
            };
        }
        logger.log('[InventoryCommand] Resolving - inventory length:', character.inventory.length);
        
        // Get all items with their container information
        const itemsWithContainers = getAllItemsWithContainers(character.inventory);
        
        let narrative = '';
        if (itemsWithContainers.length === 0) {
            narrative = "You are not carrying anything.";
        } else {
            // Format container names for display
            const formatContainerName = (containerId: string): string => {
                if (containerId === 'left-hand') return 'left hand';
                if (containerId === 'right-hand') return 'right hand';
                return containerId;
            };
            
            narrative = "Inventory:\n" + itemsWithContainers
                .map(({ item, container }) => {
                    const quantity = item.quantity && item.quantity > 1 ? ` (x${item.quantity})` : '';
                    const containerInfo = container ? ` (${formatContainerName(container)})` : '';
                    return `  - ${item.id}${quantity}${containerInfo}`;
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

