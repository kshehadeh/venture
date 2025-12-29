import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, ResolutionResult, ActionEffects, GameState } from '../types';
import { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { findItemInInventory, getAllItemsWithContainers } from '../container';
import { StatCalculator } from '../stats';
import { EffectManager } from '../effects';
import { ParsedCommand } from '../utils/nlp-parser';

export class DropCommand implements Command {
    getCommandId(): string {
        return 'drop';
    }

    matchesIntent(intent: ActionIntent): boolean {
        return intent.type === this.getCommandId();
    }

    getAliases(): { singleWords: string[]; phrasalVerbs: string[] } {
        return {
            singleWords: ['drop', 'discard', 'leave'],
            phrasalVerbs: ['put down']
        };
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({
            target: z.string().describe('Name of item in inventory to drop')
        });
    }

    processProcedural(parsed: ParsedCommand, _input: string, _context: SceneContext): NormalizedCommandInput | null {
        // Drop command needs to match items in inventory, which requires game state
        // So we can't fully process it procedurally - return null to let AI processor handle it
        // Or we could extract the target and let resolve() handle the matching
        if (!parsed.target) {
            logger.log('[DropCommand] Drop without target, returning null');
            return null;
        }

        // Extract target - actual matching will happen in resolve() where we have access to state
        return {
            commandId: 'drop',
            parameters: {
                target: parsed.target
            }
        };
    }

    async extractParameters(userInput: string, _context: SceneContext): Promise<NormalizedCommandInput | null> {
        logger.log('[DropCommand] Extracting parameters from input:', userInput);
        
        // For drop command, we need to identify items in inventory, not scene objects
        // We'll need to get the current game state to check inventory
        // But we don't have access to state here, so we'll use AI to identify the target
        // and then validate it in resolve()
        
        // Use a simplified approach: extract the target name from input
        // The actual validation will happen in resolve() where we have access to state
        const targetMatch = userInput.match(/(?:drop|put down|discard|leave)\s+(.+)/i);
        if (targetMatch && targetMatch[1]) {
            const target = targetMatch[1].trim();
            logger.log(`[DropCommand] Extracted target from input: ${target}`);
            return {
                commandId: 'drop',
                parameters: {
                    target: target
                }
            };
        }
        
        logger.log('[DropCommand] Could not extract target from input');
        return null;
    }

    execute(input: NormalizedCommandInput, context: SceneContext, originalInput?: string): ActionIntent {
        logger.log('[DropCommand] Executing with input:', JSON.stringify(input, null, 2));
        const targetId = input.parameters.target;
        logger.log(`[DropCommand] Target: ${targetId}`);
        
        if (!targetId) {
            logger.error('[DropCommand] No target parameter provided');
            throw new Error('Drop command requires a target parameter');
        }

        const intent = {
            actorId: 'player',
            type: 'drop' as const,
            targetId: targetId, // This will be matched to actual item ID in resolve()
            sceneId: context.id,
            originalInput: originalInput
        };
        logger.log('[DropCommand] ActionIntent created:', JSON.stringify(intent, null, 2));
        return intent;
    }

    resolve(state: GameState, intent: ActionIntent, _context: SceneContext, _statCalculator?: StatCalculator, _effectManager?: EffectManager): ResolutionResult {
        if (!intent.targetId) {
            return {
                outcome: 'failure',
                narrativeResolver: "Drop what?",
                effects: undefined
            };
        }

        const character = state.characters[intent.actorId || 'player'];
        if (!character) {
            return {
                outcome: 'failure',
                narrativeResolver: "Character not found.",
                effects: undefined
            };
        }

        // Build objects map for finding items
        const objectsMap: Record<string, import('../types').ObjectDefinition> = {};
        for (const entry of character.inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
            }
        }

        // Also add items from containers' contains arrays
        for (const entry of character.inventory) {
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
                            for (const otherEntry of character.inventory) {
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

        // Find the item in inventory (handles containers and slots)
        const itemResult = findItemInInventory(character.inventory, intent.targetId);
        
        if (!itemResult) {
            // Try fuzzy matching on the targetId
            const allItems = getAllItemsWithContainers(character.inventory, objectsMap);
            const matchingItem = allItems.find(({ item }) => 
                item.id.toLowerCase() === intent.targetId?.toLowerCase() ||
                item.description.toLowerCase().includes(intent.targetId?.toLowerCase() || '') ||
                item.id.toLowerCase().includes(intent.targetId?.toLowerCase() || '')
            );
            
            if (!matchingItem) {
                return {
                    outcome: 'failure',
                    narrativeResolver: `You don't have "${intent.targetId}" in your inventory.`,
                    effects: undefined
                };
            }
            
            // Use the matched item
            const item = matchingItem.item;
            
            // Create removeItems effect
            const effects: ActionEffects = {
                removeItems: [{
                    id: item.id,
                    quantity: 1 // Drop one at a time for now
                }]
            };
            
            // If the object has carryEffects with addEffects, remove those effects when dropping
            if (item.carryEffects?.addEffects) {
                effects.removeEffects = [...(item.carryEffects.addEffects)];
            }

            return {
                outcome: 'success',
                narrativeResolver: `You drop ${item.description}.`,
                effects: effects
            };
        }

        // Item found in inventory
        const item = itemResult.item;
        
        // Get full object definition if available
        const fullObjectDef = objectsMap[item.id] || item;
        
        // Create removeItems effect
        const effects: ActionEffects = {
            removeItems: [{
                id: item.id,
                quantity: 1 // Drop one at a time for now
            }]
        };
        
        // If the object has carryEffects with addEffects, remove those effects when dropping
        if (fullObjectDef.carryEffects?.addEffects) {
            effects.removeEffects = [...(fullObjectDef.carryEffects.addEffects)];
        }

        return {
            outcome: 'success',
            narrativeResolver: `You drop ${fullObjectDef.description || item.id}.`,
            effects: effects
        };
    }
}

