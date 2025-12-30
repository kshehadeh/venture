import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult, DetailedDescription, CharacterState } from '../types';
import type { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { StatCalculator } from '../stats';
import { EffectManager } from '../effects';
import { ParsedCommand } from '../utils/nlp-parser';
import { getVisibleObjects, getVisibleExits } from '../engine';
import { answerGeneralQuestion } from '../llm';
import { GameObject } from '../game-object';

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

        // Initialize stat calculator and effect manager
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

        // Collect scene information
        const sceneNarrative = context.narrative || '';
        const sceneDetailedDescriptions = this.getVisibleDetailedDescriptions(
            context.detailedDescriptions,
            playerPerception
        );

        // Collect visible objects in scene
        const sceneObjects = state.sceneObjects[state.currentSceneId] || [];
        const visibleObjects = getVisibleObjects(sceneObjects, playerPerception);
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
        });

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

        const formatContainerName = (containerId: string): string => {
            if (containerId === 'left-hand') return 'left hand';
            if (containerId === 'right-hand') return 'right hand';
            return containerId;
        };

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

