import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, ResolutionResult, ActionEffects, InventoryEntry, GameState } from '../types';
import { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { calculateContainerWeight, canFitInContainer, findContainerInInventory } from '../container';
import { validateCarryingCapacity } from '../validation';
import { StatCalculator } from '../stats';
import { identifyTarget } from '../llm';
import { ParsedCommand } from '../utils/nlp-parser';

export class PickupCommand implements Command {
    getCommandId(): string {
        return 'pickup';
    }

    matchesIntent(intent: ActionIntent): boolean {
        return intent.type === this.getCommandId();
    }

    getAliases(): { singleWords: string[]; phrasalVerbs: string[] } {
        return {
            singleWords: ['pickup', 'grab', 'take', 'get', 'collect'],
            phrasalVerbs: ['pick up']
        };
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({
            target: z.string().describe('Name of object to pick up')
        });
    }

    processProcedural(parsed: ParsedCommand, _input: string, context: SceneContext): NormalizedCommandInput | null {
        if (!parsed.target) {
            logger.log('[PickupCommand] Pickup without target, returning null');
            return null;
        }

        const matchedId = this.matchTarget(parsed.target, context);
        if (matchedId) {
            logger.log(`[PickupCommand] Matched pickup target "${parsed.target}" to object: ${matchedId}`);
            return {
                commandId: 'pickup',
                parameters: {
                    target: matchedId
                }
            };
        }

        logger.log(`[PickupCommand] Pickup target "${parsed.target}" not found, returning null`);
        return null;
    }

    /**
     * Match a target string against objects in the scene context.
     */
    private matchTarget(target: string, context: SceneContext): string | null {
        const lowerTarget = target.toLowerCase();
        const cleanTarget = lowerTarget.replace(/^(the|a|an)\s+/, '').trim();

        if (context.objects) {
            for (const obj of context.objects) {
                const objIdLower = obj.id.toLowerCase();
                const objDescLower = obj.description.toLowerCase();
                
                if (objIdLower === cleanTarget || objIdLower === lowerTarget ||
                    objDescLower.includes(cleanTarget) || objDescLower.includes(lowerTarget)) {
                    return obj.id;
                }
            }
        }

        return null;
    }

    async extractParameters(userInput: string, context: SceneContext): Promise<NormalizedCommandInput | null> {
        logger.log('[PickupCommand] Extracting parameters from input:', userInput);
        
        // Try to identify a target (object in the scene)
        const target = await identifyTarget(userInput, context, 'pickup');
        
        if (!target) {
            logger.log('[PickupCommand] No target identified');
            return null;
        }
        
        // Try to match the target to an actual object in the scene
        const objects = context.objects || [];
        const matchingObject = objects.find(obj => 
            obj.id.toLowerCase() === target.toLowerCase() ||
            obj.description.toLowerCase().includes(target.toLowerCase())
        );
        
        if (matchingObject) {
            logger.log(`[PickupCommand] Matched target "${target}" to object: ${matchingObject.id}`);
            return {
                commandId: 'pickup',
                parameters: {
                    target: matchingObject.id
                }
            };
        }
        
        logger.log(`[PickupCommand] Could not match target "${target}" to any object in scene`);
        return null;
    }

    execute(input: NormalizedCommandInput, context: SceneContext, originalInput?: string): ActionIntent {
        logger.log('[PickupCommand] Executing with input:', JSON.stringify(input, null, 2));
        // The target should already be matched to an object ID by the processor
        // But we validate it exists in the scene
        const targetId = input.parameters.target;
        logger.log(`[PickupCommand] Target ID: ${targetId}`);
        
        if (!targetId) {
            logger.error('[PickupCommand] No target parameter provided');
            throw new Error('Pickup command requires a target parameter');
        }

        // Verify object exists in scene (processor should have done this, but double-check)
        const objects = context.objects || [];
        logger.log(`[PickupCommand] Available objects in scene: ${objects.map(o => o.id).join(', ')}`);
        const object = objects.find(obj => 
            obj.id.toLowerCase() === targetId.toLowerCase() ||
            obj.description.toLowerCase().includes(targetId.toLowerCase())
        );

        if (!object) {
            logger.error(`[PickupCommand] Object "${targetId}" not found in scene`);
            throw new Error(`Object "${targetId}" not found in scene`);
        }

        logger.log(`[PickupCommand] Found object: ${object.id}, creating ActionIntent`);
        const intent = {
            actorId: 'player',
            type: 'pickup' as const,
            targetId: object.id, // Use the matched object ID
            sceneId: context.id,
            originalInput: originalInput
        };
        logger.log('[PickupCommand] ActionIntent created:', JSON.stringify(intent, null, 2));
        return intent;
    }

    resolve(state: GameState, intent: ActionIntent, context: SceneContext, statCalculator?: StatCalculator): ResolutionResult {
        if (!intent.targetId) {
            return {
                outcome: 'failure',
                narrativeResolver: "Pick up what?",
                effects: undefined
            };
        }

        // Find object in scene
        const sceneObjects = context.objects || [];
        const object = sceneObjects.find(obj => obj.id === intent.targetId);
        
        if (!object) {
            return {
                outcome: 'failure',
                narrativeResolver: `I don't see "${intent.targetId}" here.`,
                effects: undefined
            };
        }

        // Check perception requirement - use current stats
        const character = state.characters[intent.actorId || 'player'];
        if (!character) {
            return {
                outcome: 'failure',
                narrativeResolver: "Character not found.",
                effects: undefined
            };
        }
        const calc = statCalculator || new StatCalculator();
        const objectsMap: Record<string, import('../types').ObjectDefinition> = {};
        for (const entry of character.inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
            }
        }
        const currentPerception = calc.getEffectiveStat(character, 'perception', objectsMap);
        if (object.perception > currentPerception) {
            return {
                outcome: 'failure',
                narrativeResolver: "You don't notice anything special here.",
                effects: undefined
            };
        }

        // Check if removable
        if (!object.removable) {
            return {
                outcome: 'failure',
                narrativeResolver: `You can't pick up ${object.description}.`,
                effects: undefined
            };
        }

        // Calculate total weight including container contents
        calculateContainerWeight(object, objectsMap);

        // Check carrying capacity
        const capacityResult = validateCarryingCapacity(state, object, character.id);
        if (!capacityResult.valid) {
            return {
                outcome: 'failure',
                narrativeResolver: capacityResult.reason,
                effects: undefined
            };
        }

        // Try to find a container (objectsMap already created above)
        const container = findContainerInInventory(character.inventory, object, objectsMap);
        
        if (!container) {
            return {
                outcome: 'failure',
                narrativeResolver: "You don't have a container that can hold this item.",
                effects: undefined
            };
        }

        // Check if object fits in container
        const existingItems = container.contains || [];
        if (!canFitInContainer(object, container, existingItems, objectsMap)) {
            // Format container name for display (just for user-friendly messages)
            const containerName = container.id === 'left-hand' ? 'left hand' 
                : container.id === 'right-hand' ? 'right hand'
                : container.id;
            return {
                outcome: 'failure',
                narrativeResolver: `The ${object.id} doesn't fit in your ${containerName}.`,
                effects: undefined
            };
        }

        // Success - create effects to add object
        // carryEffects are applied when the item is picked up (one-time effects like adding character effects)
        // Stat modifiers should be in the effect definitions, not on objects directly
        const quantity = object.quantity || 1;
        const itemEntry: InventoryEntry = {
            id: object.id,
            quantity: quantity,
            objectData: object // Store full object definition for all objects (needed for traits, description, etc.)
        };
        
        const effects: ActionEffects = {
            addItems: [itemEntry],
            ...object.carryEffects
        };

        return {
            outcome: 'success',
            narrativeResolver: `You pick up ${object.description}.`,
            effects: effects
        };
    }
}

