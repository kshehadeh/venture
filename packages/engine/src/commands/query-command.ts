import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult, DetailedDescription, CharacterState } from '../types';
import type { SceneContext } from '../engine';
import { NormalizedCommandInput, getCommandRegistry } from '../command';
import { logger } from '../logger';
import { StatCalculator } from '../stats';
import { EffectManager } from '../effects';
import { ParsedCommand } from '../utils/nlp-parser';
import { getVisibleObjects, getVisibleExits } from '../engine';
import { answerGeneralQuestion, determineIfCommandAction, ChoiceOption } from '../llm';
import { GameObject } from '../game-object';
import { ENGINE_GLOBAL_ACTIONS } from '../globals';

export class QueryCommand implements Command {
    getCommandId(): string {
        return 'query';
    }

    matchesIntent(intent: ActionIntent): boolean {
        return intent.type === this.getCommandId();
    }

    getAliases(): { singleWords: string[]; phrasalVerbs: string[] } {
        return {
            singleWords: [],
            phrasalVerbs: []
        };
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({
            question: z.string().optional().describe('The question the player is asking')
        });
    }

    processProcedural(_parsed: ParsedCommand, _input: string, _context: SceneContext): NormalizedCommandInput | null {
        // Query command should be handled by AI processor, not procedural
        return null;
    }

    async extractParameters(userInput: string, _context: SceneContext): Promise<NormalizedCommandInput | null> {
        logger.log('[QueryCommand] Extracting parameters from input:', userInput);
        return {
            commandId: 'query',
            parameters: {
                question: userInput
            }
        };
    }

    execute(input: NormalizedCommandInput, context: SceneContext, originalInput?: string): ActionIntent {
        logger.log('[QueryCommand] Executing with input:', JSON.stringify(input, null, 2));
        const intent: ActionIntent = {
            actorId: 'player',
            type: 'query' as const,
            sceneId: context.id,
            originalInput: originalInput || input.parameters.question as string
        };
        logger.log('[QueryCommand] ActionIntent created:', JSON.stringify(intent, null, 2));
        return intent;
    }

    async resolve(
        state: GameState,
        intent: ActionIntent,
        context: SceneContext,
        statCalculator?: StatCalculator,
        effectManager?: EffectManager
    ): Promise<ResolutionResult> {
        const player = state.characters[intent.actorId || 'player'];
        if (!player) {
            return {
                outcome: 'failure',
                narrativeResolver: "Character not found.",
                effects: undefined
            };
        }

        const question = intent.originalInput || '';
        if (!question) {
            return {
                outcome: 'failure',
                narrativeResolver: "No question provided.",
                effects: undefined
            };
        }

        logger.log('[QueryCommand] Resolving query:', question);

        // First, use AI to determine if the user is trying to perform an action on an object
        // If so, attempt to execute that command instead of answering as a question
        const registry = getCommandRegistry();
        const allCommandIds = registry.getAllCommandIds();
        
        // Build list of available commands (excluding query itself)
        const availableOptions: ChoiceOption[] = allCommandIds
            .filter(id => id !== 'query')
            .map(id => {
                const engineGlobal = ENGINE_GLOBAL_ACTIONS.find(g => g.id === id);
                return {
                    id: id,
                    text: engineGlobal?.text || id
                };
            });

        // Initialize stat calculator and effect manager (needed for object info)
        const calc = statCalculator || new StatCalculator();
        const em = effectManager || new EffectManager(state.effectDefinitions);

        // Build objects map for stat calculation
        const objectsMap: Record<string, GameObject> = {};
        for (const entry of player.inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
            }
        }

        // Get player's current perception
        const playerPerception = calc.getEffectiveStat(player, 'perception', objectsMap);

        // Collect visible objects in scene
        const sceneObjects = state.sceneObjects[state.currentSceneId] || [];
        const visibleObjects = getVisibleObjects(sceneObjects, playerPerception);

        // Build objects info with available actions for AI analysis
        const objectsActionInfo: Array<{
            id: string;
            description: string;
            location: 'scene' | 'inventory';
            availableActions: string[];
        }> = [];

        // Add scene objects
        for (const obj of visibleObjects) {
            const actions: string[] = ['look']; // Look is always available
            
            if (obj.removable) {
                actions.push('pickup');
            }
            
            // Add state actions if object has states
            if (obj.states) {
                for (const state of obj.states) {
                    if (state.actionNames && state.actionNames.length > 0) {
                        actions.push(...state.actionNames);
                    }
                }
            }
            
            objectsActionInfo.push({
                id: obj.id,
                description: obj.description,
                location: 'scene',
                availableActions: actions
            });
        }

        // Add inventory objects
        for (const entry of player.inventory) {
            if (entry.objectData) {
                const obj = entry.objectData instanceof GameObject 
                    ? entry.objectData 
                    : GameObject.fromJSON(entry.objectData as any);
                
                const actions: string[] = ['look']; // Look is always available
                actions.push('drop'); // Can always drop items from inventory
                actions.push('transfer'); // Can transfer items in inventory
                
                // Add state actions if object has states
                if (obj.states) {
                    for (const state of obj.states) {
                        if (state.actionNames && state.actionNames.length > 0) {
                            actions.push(...state.actionNames);
                        }
                    }
                }
                
                objectsActionInfo.push({
                    id: entry.id,
                    description: obj.description,
                    location: 'inventory',
                    availableActions: actions
                });
            }
        }

        // Use AI to determine if this is a command action or a question
        if (availableOptions.length > 0) {
            logger.log('[QueryCommand] Using AI to determine if input is a command action...');
            const actionAnalysis = await determineIfCommandAction(question, availableOptions, objectsActionInfo, state, context, statCalculator, effectManager);
            
            // If AI determined this is a command action with high confidence, execute it
            if (actionAnalysis.isCommandAction && actionAnalysis.commandId && actionAnalysis.confidence > 0.7) {
                logger.log(`[QueryCommand] AI detected command action: ${actionAnalysis.commandId} (confidence: ${actionAnalysis.confidence}), executing...`);
                
                const detectedCommand = registry.getCommand(actionAnalysis.commandId);
                if (detectedCommand && detectedCommand.extractParameters) {
                    try {
                        // Extract parameters using the command's extractParameters method
                        const normalizedInput = await detectedCommand.extractParameters(question, context);
                        
                        if (normalizedInput) {
                            // Execute the command to get an ActionIntent
                            const actionIntent = detectedCommand.execute(normalizedInput, context, question);
                            
                            // Resolve the action using the command's resolve method
                            const result = await detectedCommand.resolve(state, actionIntent, context, statCalculator, effectManager);
                            
                            logger.log(`[QueryCommand] Successfully executed command ${actionAnalysis.commandId}`);
                            return result;
                        } else {
                            logger.log(`[QueryCommand] Command ${actionAnalysis.commandId} could not extract parameters, falling back to query`);
                        }
                    } catch (error) {
                        logger.error(`[QueryCommand] Error executing command ${actionAnalysis.commandId}:`, error);
                        // Fall through to normal query flow
                    }
                } else {
                    logger.log(`[QueryCommand] Command ${actionAnalysis.commandId} not found in registry, falling back to query`);
                }
            } else {
                logger.log(`[QueryCommand] AI determined input is a question (confidence: ${actionAnalysis.confidence}), treating as question`);
            }
        }

        // Stat calculator and effect manager already initialized above
        // Objects map and player perception already calculated above
        // sceneObjects and visibleObjects already calculated above

        // Collect scene information
        const sceneNarrative = context.narrative || '';
        const sceneDetailedDescriptions = this.getVisibleDetailedDescriptions(
            context.detailedDescriptions,
            playerPerception
        );

        // Build objects info for answerGeneralQuestion (different format than objectsActionInfo)
        const objectsInfo = visibleObjects.map(obj => ({
            object: obj,
            detailedDescriptions: obj.getVisibleDetailedDescriptions(playerPerception)
        }));

        // Collect NPCs in scene
        const npcsInfo = (context.npcs || []).map(npc => {
            // Check if NPC is visible (not hidden or player perception >= NPC agility)
            let npcAgility = npc.baseStats.agility || 0;
            let isHidden = (npc.traits || []).includes('hidden');
            
            const npcCharacter = state.characters[npc.id];
            if (npcCharacter) {
                const npcObjectsMap: Record<string, GameObject> = {};
                for (const entry of npcCharacter.inventory) {
                    if (entry.objectData) {
                        npcObjectsMap[entry.id] = entry.objectData;
                    }
                }
                npcAgility = calc.getEffectiveStat(npcCharacter, 'agility', npcObjectsMap);
                isHidden = npcCharacter.traits.has('hidden');
            }

            const isVisible = !isHidden || (isHidden && playerPerception >= npcAgility);
            
            return {
                npc: npc,
                detailedDescriptions: isVisible 
                    ? this.getVisibleDetailedDescriptions(npc.detailedDescriptions, playerPerception)
                    : [],
                isVisible
            };
        }).filter(info => info.isVisible);

        // Collect visible exits
        const exits = context.exits || [];
        const visibleExits = getVisibleExits(exits, playerPerception);
        const exitsInfo = visibleExits.map(exit => ({
            exit: exit,
            detailedDescriptions: this.getVisibleDetailedDescriptions(exit.detailedDescriptions, playerPerception)
        }));

        // Collect player inventory information
        const inventoryInfo = this.collectInventoryInfo(player, objectsMap);

        // Collect player stats
        const currentStats = calc.calculateCurrentStats(player, objectsMap);
        const statsInfo = {
            health: currentStats.health,
            willpower: currentStats.willpower,
            perception: currentStats.perception,
            reputation: currentStats.reputation,
            strength: currentStats.strength,
            agility: currentStats.agility
        };

        // Collect player traits
        const traits = Array.from(player.traits);

        // Collect player flags
        const flags = Array.from(player.flags);

        // Collect player effects
        const effectsInfo = player.effects.map(effect => {
            const definition = em.getEffectDefinition(effect.id);
            return {
                id: effect.id,
                name: definition?.name || effect.id,
                description: definition?.description || 'An unknown effect.',
                duration: effect.duration,
                statModifiers: effect.statModifiers,
                perTurnModifiers: effect.perTurnModifiers
            };
        });

        // Call LLM to answer the question
        const answer = await answerGeneralQuestion(question, {
            sceneNarrative,
            sceneDetailedDescriptions,
            objects: objectsInfo,
            npcs: npcsInfo.map(info => ({
                npc: info.npc,
                detailedDescriptions: info.detailedDescriptions
            })),
            exits: exitsInfo,
            inventory: inventoryInfo,
            stats: statsInfo,
            traits,
            flags,
            effects: effectsInfo
        }, state, context, statCalculator, effectManager);

        // Update conversation history (note: this should ideally be done in processTurn, but we'll do it here for now)
        // The state will be updated when the result is applied in processTurn

        return {
            outcome: 'success',
            narrativeResolver: answer,
            effects: undefined,
            nextSceneId: undefined
        };
    }

    /**
     * Filter detailed descriptions by perception and return visible ones.
     */
    private getVisibleDetailedDescriptions(
        detailedDescriptions: DetailedDescription[] | undefined,
        playerPerception: number
    ): DetailedDescription[] {
        if (!detailedDescriptions) return [];
        return detailedDescriptions.filter(dd => dd.perception <= playerPerception);
    }

    /**
     * Collect comprehensive inventory information including nested containers and slots.
     */
    private collectInventoryInfo(
        player: CharacterState,
        objectsMap: Record<string, GameObject>
    ): string {
        if (player.inventory.length === 0) {
            return 'You are not carrying anything.';
        }

        let inventoryText = 'Inventory:\n';
        
        for (const entry of player.inventory) {
            const quantity = entry.quantity && entry.quantity > 1 ? ` (x${entry.quantity})` : '';
            inventoryText += `  - ${entry.id}${quantity}`;
            
            if (entry.objectData) {
                const obj = entry.objectData;
                inventoryText += `: ${obj.description}`;
                
                // Add container contents if it's a container
                if (obj.isContainer()) {
                    // General storage
                    if (obj.contains && obj.contains.length > 0) {
                        inventoryText += '\n    Contains:';
                        for (const item of obj.contains) {
                            const itemQty = item.quantity && item.quantity > 1 ? ` (x${item.quantity})` : '';
                            inventoryText += `\n      - ${item.id}${itemQty}: ${item.description}`;
                        }
                    }
                    
                    // Slots
                    if (obj.slots && obj.slots.length > 0) {
                        const occupiedSlots = obj.slots.filter(slot => slot.itemId);
                        if (occupiedSlots.length > 0) {
                            inventoryText += '\n    Slots:';
                            for (const slot of occupiedSlots) {
                                const slotName = slot.name || slot.id;
                                const slotItem = objectsMap[slot.itemId!];
                                if (slotItem) {
                                    inventoryText += `\n      - ${slotName}: ${slot.itemId} (${slotItem.description})`;
                                } else {
                                    inventoryText += `\n      - ${slotName}: ${slot.itemId}`;
                                }
                            }
                        }
                    }
                }
            }
            
            inventoryText += '\n';
        }

        return inventoryText;
    }
}

