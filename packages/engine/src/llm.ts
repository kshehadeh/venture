import { openai } from '@ai-sdk/openai';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { logger } from './logger';
import { DetailedDescription, GameState } from './types';
import { GameObject } from './game-object';
import type { SceneContext } from './engine';
import { getVisibleObjects, getVisibleExits } from './engine';
import { StatCalculator } from './stats';
import { EffectManager } from './effects';

// Define the interface for the Choice data we need
export interface ChoiceOption {
    id: string;
    text: string; // The text prompt shown to the user (e.g., "[left] Go left")
}

/**
 * Build comprehensive context string for LLM interactions.
 * Includes scene information, character stats, inventory, and conversation history.
 */
function buildLLMContext(
    state: GameState,
    context: SceneContext,
    statCalculator: StatCalculator,
    effectManager: EffectManager
): string {
    const player = state.characters.player
    if (!player) {
        return 'No player character found.';
    }

    let contextInfo = '';

    // Build objects map for stat calculation
    const objectsMap: Record<string, GameObject> = {};
    for (const entry of player.inventory) {
        if (entry.objectData) {
            objectsMap[entry.id] = entry.objectData;
        }
    }

    // Get player's current perception
    const playerPerception = statCalculator.getEffectiveStat(player, 'perception', objectsMap);

    // Scene information
    if (context.narrative) {
        contextInfo += `Current Scene (${context.id}):\n${context.narrative}\n\n`;
    }

    // Scene detailed descriptions
    if (context.detailedDescriptions && context.detailedDescriptions.length > 0) {
        const visibleSceneDetails = context.detailedDescriptions.filter(dd => dd.perception <= playerPerception);
        if (visibleSceneDetails.length > 0) {
            contextInfo += 'Scene Additional Details:\n';
            for (const detail of visibleSceneDetails) {
                contextInfo += `- ${detail.text}\n`;
            }
            contextInfo += '\n';
        }
    }

    // Objects in scene
    const sceneObjects = state.sceneObjects[state.currentSceneId] || [];
    const visibleObjects = getVisibleObjects(sceneObjects, playerPerception);
    if (visibleObjects.length > 0) {
        contextInfo += 'Objects in Scene:\n';
        for (const obj of visibleObjects) {
            contextInfo += `- ${obj.id}: ${obj.description}`;
            const objDetails = obj.getVisibleDetailedDescriptions(playerPerception);
            if (objDetails && objDetails.length > 0) {
                contextInfo += '\n  Additional details:';
                for (const detail of objDetails) {
                    contextInfo += `\n    - ${detail.text}`;
                }
            }
            contextInfo += '\n';
        }
        contextInfo += '\n';
    }

    // NPCs in scene
    if (context.npcs && context.npcs.length > 0) {
        const visibleNPCs: Array<{ npc: import('./types').NPCDefinition; detailedDescriptions: DetailedDescription[] }> = [];
        for (const npc of context.npcs) {
            // Check if NPC is visible
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
                npcAgility = statCalculator.getEffectiveStat(npcCharacter, 'agility', npcObjectsMap);
                isHidden = npcCharacter.traits.has('hidden');
            }

            const isVisible = !isHidden || (isHidden && playerPerception >= npcAgility);
            if (isVisible) {
                const npcDetails = npc.detailedDescriptions 
                    ? npc.detailedDescriptions.filter(dd => dd.perception <= playerPerception)
                    : [];
                visibleNPCs.push({ npc, detailedDescriptions: npcDetails });
            }
        }

        if (visibleNPCs.length > 0) {
            contextInfo += 'NPCs in Scene:\n';
            for (const { npc, detailedDescriptions } of visibleNPCs) {
                const npcDesc = npc.description || `${npc.name} is here.`;
                contextInfo += `- ${npc.name} (${npc.id}): ${npcDesc}`;
                if (npc.baseStats) {
                    contextInfo += `\n  Stats: health=${npc.baseStats.health}, willpower=${npc.baseStats.willpower}, perception=${npc.baseStats.perception}, reputation=${npc.baseStats.reputation}, strength=${npc.baseStats.strength}, agility=${npc.baseStats.agility}`;
                }
                if (npc.traits && npc.traits.length > 0) {
                    contextInfo += `\n  Traits: ${npc.traits.join(', ')}`;
                }
                if (npc.personality) {
                    contextInfo += `\n  Personality: ${npc.personality}`;
                }
                if (npc.keyInformation && npc.keyInformation.length > 0) {
                    // Filter key information by player's perception
                    const availableInfo = npc.keyInformation.filter(info => info.perception <= playerPerception);
                    if (availableInfo.length > 0) {
                        contextInfo += '\n  Available Information (that this NPC knows):';
                        for (const info of availableInfo) {
                            contextInfo += `\n    - ${info.text}`;
                        }
                    }
                }
                if (detailedDescriptions && detailedDescriptions.length > 0) {
                    contextInfo += '\n  Additional details:';
                    for (const detail of detailedDescriptions) {
                        contextInfo += `\n    - ${detail.text}`;
                    }
                }
                contextInfo += '\n';
            }
            contextInfo += '\n';
        }
    }

    // Exits from scene
    if (context.exits && context.exits.length > 0) {
        const visibleExits = getVisibleExits(context.exits, playerPerception);
        if (visibleExits.length > 0) {
            contextInfo += 'Exits from Scene:\n';
            for (const exit of visibleExits) {
                const exitDesc = exit.description || exit.name || `A ${exit.direction.toUpperCase()} exit.`;
                contextInfo += `- ${exit.direction.toUpperCase()}: ${exitDesc}`;
                if (exit.nextSceneId) {
                    contextInfo += ` (leads to: ${exit.nextSceneId})`;
                }
                if (exit.detailedDescriptions) {
                    const exitDetails = exit.detailedDescriptions.filter(dd => dd.perception <= playerPerception);
                    if (exitDetails.length > 0) {
                        contextInfo += '\n  Additional details:';
                        for (const detail of exitDetails) {
                            contextInfo += `\n    - ${detail.text}`;
                        }
                    }
                }
                contextInfo += '\n';
            }
            contextInfo += '\n';
        }
    }

    // Player inventory
    if (player.inventory.length === 0) {
        contextInfo += 'Player Inventory: You are not carrying anything.\n\n';
    } else {
        contextInfo += 'Player Inventory:\n';
        for (const entry of player.inventory) {
            const quantity = entry.quantity && entry.quantity > 1 ? ` (x${entry.quantity})` : '';
            contextInfo += `  - ${entry.id}${quantity}`;
            
            if (entry.objectData) {
                const obj = entry.objectData;
                contextInfo += `: ${obj.description}`;
                
                // Add container contents if it's a container
                if (obj.isContainer()) {
                    // General storage
                    if (obj.contains && obj.contains.length > 0) {
                        contextInfo += '\n    Contains:';
                        for (const item of obj.contains) {
                            const itemQty = item.quantity && item.quantity > 1 ? ` (x${item.quantity})` : '';
                            contextInfo += `\n      - ${item.id}${itemQty}: ${item.description}`;
                        }
                    }
                    
                    // Slots
                    if (obj.slots && obj.slots.length > 0) {
                        const occupiedSlots = obj.slots.filter(slot => slot.itemId);
                        if (occupiedSlots.length > 0) {
                            contextInfo += '\n    Slots:';
                            for (const slot of occupiedSlots) {
                                const slotName = slot.name || slot.id;
                                const slotItem = objectsMap[slot.itemId!];
                                if (slotItem) {
                                    contextInfo += `\n      - ${slotName}: ${slot.itemId} (${slotItem.description})`;
                                } else {
                                    contextInfo += `\n      - ${slotName}: ${slot.itemId}`;
                                }
                            }
                        }
                    }
                }
            }
            contextInfo += '\n';
        }
        contextInfo += '\n';
    }

    // Player stats
    const currentStats = statCalculator.calculateCurrentStats(player, objectsMap);
    contextInfo += 'Player Stats:\n';
    contextInfo += `  Health: ${currentStats.health}\n`;
    contextInfo += `  Willpower: ${currentStats.willpower}\n`;
    contextInfo += `  Perception: ${currentStats.perception}\n`;
    contextInfo += `  Reputation: ${currentStats.reputation}\n`;
    contextInfo += `  Strength: ${currentStats.strength}\n`;
    contextInfo += `  Agility: ${currentStats.agility}\n\n`;

    // Player traits
    const traits = Array.from(player.traits);
    if (traits.length > 0) {
        contextInfo += `Player Traits: ${traits.join(', ')}\n\n`;
    }

    // Player flags
    const flags = Array.from(player.flags);
    if (flags.length > 0) {
        contextInfo += `Player Flags: ${flags.join(', ')}\n\n`;
    }

    // Player effects
    const effectsInfo = player.effects.map(effect => {
        const definition = effectManager.getEffectDefinition(effect.id);
        return {
            id: effect.id,
            name: definition?.name || effect.id,
            description: definition?.description || 'An unknown effect.',
            duration: effect.duration,
            statModifiers: effect.statModifiers,
            perTurnModifiers: effect.perTurnModifiers
        };
    });

    if (effectsInfo.length > 0) {
        contextInfo += 'Player Active Effects:\n';
        for (const effect of effectsInfo) {
            contextInfo += `  - ${effect.name} (${effect.id}): ${effect.description}`;
            if (effect.duration !== undefined) {
                contextInfo += ` (${effect.duration} turn${effect.duration !== 1 ? 's' : ''} remaining)`;
            } else {
                contextInfo += ' (Permanent)';
            }
            if (effect.statModifiers) {
                const modifiers: string[] = [];
                for (const [key, value] of Object.entries(effect.statModifiers)) {
                    if (value !== 0) {
                        modifiers.push(`${key}: ${value > 0 ? '+' : ''}${value}`);
                    }
                }
                if (modifiers.length > 0) {
                    contextInfo += `\n    Stat modifiers: ${modifiers.join(', ')}`;
                }
            }
            if (effect.perTurnModifiers) {
                const perTurnMods: string[] = [];
                for (const [key, value] of Object.entries(effect.perTurnModifiers)) {
                    if (value !== 0) {
                        perTurnMods.push(`${key}: ${value > 0 ? '+' : ''}${value} per turn`);
                    }
                }
                if (perTurnMods.length > 0) {
                    contextInfo += `\n    Per-turn modifiers: ${perTurnMods.join(', ')}`;
                }
            }
            contextInfo += '\n';
        }
        contextInfo += '\n';
    }

    // Conversation history (for general queries - "query" context)
    if (state.conversationHistory && state.conversationHistory['query']) {
        const queryHistory = state.conversationHistory['query'];
        if (queryHistory.length > 0) {
            contextInfo += 'Previous Conversation History (General Queries):\n';
            for (const entry of queryHistory) {
                contextInfo += `  Player: ${entry.user}\n`;
                contextInfo += `  Assistant: ${entry.assistant}\n\n`;
            }
        }
    }

    return contextInfo;
}

/**
 * Basic classification to identify command ID only (without parameters).
 * Used as a first step before parameter extraction.
 */
export async function classifyCommandId(
    userInput: string,
    availableChoices: ChoiceOption[],
    state?: GameState,
    context?: SceneContext,
    statCalculator?: StatCalculator,
    effectManager?: EffectManager
): Promise<{ commandId: string | null; confidence: number }> {
    logger.log('[classifyCommandId] Classifying command ID for input:', userInput);
    logger.log(`[classifyCommandId] Available choices: ${availableChoices.length}`);
    
    if (!availableChoices.length) {
        logger.log('[classifyCommandId] No available choices, returning null');
        return { commandId: null, confidence: 0 };
    }

    // Build context string if state and context are provided
    let contextInfo = '';
    if (state && context && statCalculator && effectManager) {
        contextInfo = buildLLMContext(state, context, statCalculator, effectManager);
    }

    try {
        logger.log('[classifyCommandId] Calling LLM...');
        const { object } = await generateObject({
            model: openai('gpt-4o'),
            schema: z.object({
                commandId: z.string().nullable().describe('The ID of the command that matches the user intent, or null if unrelated.'),
                verb: z.string().nullable().describe('The verb that matches the user intent, or null if unrelated.'),
                target: z.string().nullable().describe('The target that matches the user intent, or null if unrelated.'),
                verbPhrase: z.string().nullable().describe('The verb phrase that matches the user intent, or null if unrelated.'),
                destination: z.string().nullable().describe('The destination that matches the user intent, or null if unrelated.'),
                preposition: z.string().nullable().describe('The preposition that matches the user intent, or null if unrelated.'),
                remainingText: z.string().nullable().describe('The remaining text that matches the user intent, or null if unrelated.'),
                confidence: z.number().describe('Confidence level between 0 and 1'),
                reasoning: z.string().describe('Quick explanation of why this command matches')
            }),
            system: `
        You are a dungeon master assistant interpreting player commands in a text adventure game.
        
        Current context:
        The player is presented with a list of specific commands/choices.
        Your goal is to map the player's natural language input to ONE of these valid command IDs.

        If there is no good match, determine if this is a question about the scene.  If so, then return the commandId of "query" with the target being the question.
        
        Rules:
        1. If the input strongly matches the intent of a command, return that command's ID.
        2. If the input is ambiguous or doesn't match any command, return null.
        3. Be generous with synonyms (e.g., "walk north" -> "north", "attack" -> "fight").
        4. Ignore case and minor typos.
        5. Consider the current game state, scene, and player's inventory when interpreting commands.
      `,
            prompt: `${contextInfo ? `Game Context:\n${contextInfo}\n\n` : ''}Available Commands:
        ${availableChoices.map(c => `- ID: "${c.id}" | Description: "${c.text}"`).join('\n')}
        
        Player Input: "${userInput}"
      `
        });

        logger.log('[classifyCommandId] LLM response:', object);
        if (object.commandId && object.confidence > 0.6) {
            const commandExists = availableChoices.find(c => c.id === object.commandId);
            if (commandExists) {
                logger.log(`[classifyCommandId] Found command: ${object.commandId} (confidence: ${object.confidence})`);
                return { commandId: object.commandId, confidence: object.confidence };
            } else {
                logger.log(`[classifyCommandId] Command ${object.commandId} not found in available choices`);
                return { commandId: null, confidence: 0 };
            }
        } else {
            logger.log(`[classifyCommandId] Low confidence (${object.confidence}) or no command ID`);
        }

        return { commandId: null, confidence: object.confidence };
    } catch (error) {
        logger.error("[classifyCommandId] LLM Classification failed:", error);
        return { commandId: null, confidence: 0 };
    }
}

/**
 * Identify a target (object, NPC, exit, or scene) from user input.
 * This is a helper function that commands can use to identify what the user is referring to.
 * 
 * @param userInput Raw user input string
 * @param context Scene context to help identify targets
 * @param commandId The command ID (for context in the prompt)
 * @param state Optional game state for comprehensive context
 * @param statCalculator Optional stat calculator for context building
 * @param effectManager Optional effect manager for context building
 * @returns The identified target string or null if no target found
 */
export async function identifyTarget(
    userInput: string,
    context: import('./engine').SceneContext,
    commandId: string,
    state?: GameState,
    statCalculator?: StatCalculator,
    effectManager?: EffectManager
): Promise<string | null> {
    logger.log(`[identifyTarget] Identifying target for command ${commandId} from input:`, userInput);
    
    // Build list of available targets in the scene
    const availableTargets: string[] = [];
    if (context.objects) {
        availableTargets.push(...context.objects.map(obj => `${obj.id} (${obj.description})`));
    }
    if (context.npcs) {
        availableTargets.push(...context.npcs.map(npc => `${npc.id} (${npc.name})`));
    }
    if (context.exits) {
        availableTargets.push(...context.exits.map(exit => `${exit.direction} (${exit.name || exit.description || exit.direction})`));
    }
    availableTargets.push(`${context.id} (scene)`);
    
    // Check if input is a question
    const isQuestion = /[?]|^(what|how|why|when|where|who|which|whose|does|do|is|are|can|could|will|would|should)\s/i.test(userInput);
    
    // Build context string if state is provided
    let contextInfo = '';
    if (state && statCalculator && effectManager) {
        contextInfo = buildLLMContext(state, context, statCalculator, effectManager);
    }
    
    try {
        const targetResult = await generateObject({
            model: openai('gpt-4o'),
            schema: z.object({
                target: z.string().nullable().describe('The target the user is referring to (object, NPC, exit, or scene), or null if no clear target'),
                confidence: z.number().describe('Confidence level for target identification')
            }),
            system: `
        You are identifying what target the player is referring to in a text adventure game command.
        
        IMPORTANT: If the player input is a question (contains question words like "what", "how", "why", "does", "is", etc., or ends with "?"), 
        the player is trying to examine or get information about something.
        
        Your goal is to identify ONE target (object, NPC, exit, or scene) that the user is referring to in their command.
        If the command doesn't clearly refer to a specific target, return null.
        
        Examples:
        - "look at sword" -> target: "sword"
        - "examine the guard" -> target: "guard" (if guard is an NPC)
        - "what's in the room?" -> target: null (no specific target)
        - "does the sword have writing?" -> target: "sword"
        - "what does the signpost say?" -> target: "signpost"
      `,
            prompt: `${contextInfo ? `Game Context:\n${contextInfo}\n\n` : ''}Command ID: "${commandId}"${isQuestion ? ' (input is a question)' : ''}
        Player Input: "${userInput}"
        
        Available Targets in Scene:
        ${availableTargets.length > 0 ? availableTargets.map(t => `- ${t}`).join('\n') : 'None'}
        
        Identify the target the user is referring to, or return null if no clear target is mentioned.
        ${isQuestion ? '\nNote: Since this is a question, identify what the player wants to examine.' : ''}
      `
        });
        
        logger.log('[identifyTarget] Target identification result:', targetResult.object);
        
        if (targetResult.object.target && targetResult.object.confidence > 0.5) {
            return targetResult.object.target;
        }
        
        return null;
    } catch (error) {
        logger.error("[identifyTarget] Failed to identify target:", error);
        return null;
    }
}

/**
 * Answer a conversational question about a target (object, NPC, exit, or scene)
 * using all available descriptions and context.
 * 
 * @param question The player's question about the target
 * @param targetDescription Base description of the target
 * @param detailedDescriptions Array of detailed descriptions visible to the player
 * @param context Additional context including scene narrative, objects, NPCs, exits, and their detailed descriptions
 * @param state Optional game state for comprehensive context and conversation history
 * @param sceneContext Optional scene context for comprehensive context building
 * @param statCalculator Optional stat calculator for context building
 * @param effectManager Optional effect manager for context building
 * @returns AI-generated answer to the question
 */
export async function answerQuestionAboutTarget(
    question: string,
    targetDescription: string,
    detailedDescriptions: DetailedDescription[],
    context: {
        sceneNarrative?: string;
        sceneDetailedDescriptions?: DetailedDescription[];
        otherObjects?: Array<{
            object: GameObject;
            detailedDescriptions: DetailedDescription[];
        }>;
        npcs?: Array<{
            npc: import('./types').NPCDefinition;
            detailedDescriptions: DetailedDescription[];
        }>;
        exits?: Array<{
            exit: import('./types').ExitDefinition;
            detailedDescriptions: DetailedDescription[];
        }>;
    },
    state?: GameState,
    sceneContext?: SceneContext,
    statCalculator?: StatCalculator,
    effectManager?: EffectManager
): Promise<string> {
    logger.log('[answerQuestionAboutTarget] Answering question:', question);
    logger.log('[answerQuestionAboutTarget] Target description:', targetDescription);
    logger.log(`[answerQuestionAboutTarget] Detailed descriptions: ${detailedDescriptions.length}`);
    
    try {
        // Build context string with all available information
        let contextInfo = `Target Description:\n${targetDescription}\n\n`;
        
        if (detailedDescriptions.length > 0) {
            contextInfo += 'Additional Details about Target:\n';
            for (const detail of detailedDescriptions) {
                contextInfo += `- ${detail.text}\n`;
            }
            contextInfo += '\n';
        }
        
        if (context.sceneNarrative) {
            contextInfo += `Scene Context:\n${context.sceneNarrative}\n\n`;
        }
        
        if (context.sceneDetailedDescriptions && context.sceneDetailedDescriptions.length > 0) {
            contextInfo += 'Scene Additional Details:\n';
            for (const detail of context.sceneDetailedDescriptions) {
                contextInfo += `- ${detail.text}\n`;
            }
            contextInfo += '\n';
        }
        
        if (context.otherObjects && context.otherObjects.length > 0) {
            contextInfo += 'Other Objects in Scene:\n';
            for (const { object, detailedDescriptions: objDetails } of context.otherObjects) {
                contextInfo += `- ${object.description}`;
                if (objDetails && objDetails.length > 0) {
                    contextInfo += '\n  Additional details:';
                    for (const detail of objDetails) {
                        contextInfo += `\n    - ${detail.text}`;
                    }
                }
                contextInfo += '\n';
            }
            contextInfo += '\n';
        }
        
        if (context.npcs && context.npcs.length > 0) {
            contextInfo += 'NPCs in Scene:\n';
            for (const { npc, detailedDescriptions: npcDetails } of context.npcs) {
                const npcDesc = npc.description || `${npc.name} is here.`;
                contextInfo += `- ${npcDesc}`;
                if (npcDetails && npcDetails.length > 0) {
                    contextInfo += '\n  Additional details:';
                    for (const detail of npcDetails) {
                        contextInfo += `\n    - ${detail.text}`;
                    }
                }
                contextInfo += '\n';
            }
            contextInfo += '\n';
        }
        
        if (context.exits && context.exits.length > 0) {
            contextInfo += 'Exits from Scene:\n';
            for (const { exit, detailedDescriptions: exitDetails } of context.exits) {
                const exitDesc = exit.description || exit.name || `A ${exit.direction.toUpperCase()} exit.`;
                contextInfo += `- ${exitDesc}`;
                if (exitDetails && exitDetails.length > 0) {
                    contextInfo += '\n  Additional details:';
                    for (const detail of exitDetails) {
                        contextInfo += `\n    - ${detail.text}`;
                    }
                }
                contextInfo += '\n';
            }
            contextInfo += '\n';
        }
        
        // Add comprehensive game context if available
        let comprehensiveContext = '';
        if (state && sceneContext && statCalculator && effectManager) {
            comprehensiveContext = buildLLMContext(state, sceneContext, statCalculator, effectManager);
        }
        
        logger.log('[answerQuestionAboutTarget] Calling LLM with context...');
        const { text } = await generateText({
            model: openai('gpt-4o'),
            system: `You are a helpful narrator in a text adventure game. The player is asking a question about something they can see in the current scene.

Your role is to answer the question based ONLY on the information provided in the context. If the information isn't available in the context, you should indicate that the answer isn't clear from what can be observed.

Guidelines:
- Answer naturally and conversationally, as if you're describing what the player observes
- Stay consistent with the game's tone and style
- Only use information from the provided context
- If the question can't be answered from the context, say so naturally (e.g., "You can't quite make that out" or "That detail isn't clear from here")
- Keep answers concise but informative
- Write in second person ("you see", "you notice", etc.)
- Consider previous conversation history when answering to maintain consistency`,
            prompt: `${comprehensiveContext ? `Game Context:\n${comprehensiveContext}\n\n` : ''}Target-Specific Context:
${contextInfo}

Player's Question: "${question}"

Answer the player's question based on the context provided above.`
        });
        
        logger.log('[answerQuestionAboutTarget] LLM response:', text);
        return text;
    } catch (error) {
        logger.error('[answerQuestionAboutTarget] Failed to generate answer:', error);
        return "You're not quite sure how to answer that question based on what you can observe.";
    }
}

/**
 * Determine if user input is a command action that should be executed, or a question that should be answered.
 * Uses AI to analyze the intent of the input.
 * 
 * @param userInput The user's input string
 * @param availableCommands List of available command IDs and their descriptions
 * @param objectsInfo Optional information about objects in the scene and inventory with their available actions
 * @param state Optional game state for comprehensive context
 * @param context Optional scene context for comprehensive context building
 * @param statCalculator Optional stat calculator for context building
 * @param effectManager Optional effect manager for context building
 * @returns Object indicating if it's a command action, the command ID if so, and confidence level
 */
export async function determineIfCommandAction(
    userInput: string,
    availableCommands: ChoiceOption[],
    objectsInfo?: Array<{
        id: string;
        description: string;
        location: 'scene' | 'inventory';
        availableActions: string[]; // List of action names/commands that can be performed on this object
    }>,
    state?: GameState,
    context?: SceneContext,
    statCalculator?: StatCalculator,
    effectManager?: EffectManager
): Promise<{ isCommandAction: boolean; commandId: string | null; confidence: number }> {
    logger.log('[determineIfCommandAction] Analyzing input:', userInput);
    logger.log(`[determineIfCommandAction] Available commands: ${availableCommands.length}`);
    
    if (!availableCommands.length) {
        logger.log('[determineIfCommandAction] No available commands, treating as question');
        return { isCommandAction: false, commandId: null, confidence: 0 };
    }

    // Build context string if state is provided
    let contextInfo = '';
    if (state && context && statCalculator && effectManager) {
        contextInfo = buildLLMContext(state, context, statCalculator, effectManager);
    }

    try {
        const { object } = await generateObject({
            model: openai('gpt-4o'),
            schema: z.object({
                isCommandAction: z.boolean().describe('True if the user is trying to perform an action/command (e.g., "pick up sword", "go north", "drop key"), false if they are asking a question or seeking information'),
                commandId: z.string().nullable().describe('The ID of the command to execute if isCommandAction is true, or null if it is a question'),
                confidence: z.number().describe('Confidence level between 0 and 1 for this determination'),
                reasoning: z.string().describe('Brief explanation of why this is a command action or a question')
            }),
            system: `You are analyzing player input in a text adventure game to determine if the player is trying to PERFORM AN ACTION or ASK A QUESTION.

CRITICAL DISTINCTION:
- COMMAND ACTIONS: The player wants to DO something (pick up, drop, move, transfer, look at specific object, etc.)
  Examples: "pick up sword", "go north", "drop the key", "take the torch", "move east", "put sword in backpack"
  
- QUESTIONS: The player wants INFORMATION about something (what, how, why, where, etc.)
  Examples: "what is that?", "how do I open this?", "where is the exit?", "what's in my inventory?", "who is that person?"

Rules:
1. If the input is clearly an action verb with a target (pick up, drop, go, take, move, put, etc.), it's a COMMAND ACTION
2. If the input starts with question words (what, how, why, where, who, which, etc.) or ends with "?", it's usually a QUESTION
3. Commands like "look at X" can be ambiguous - if it's "look at sword" (action to examine), it's a command. If it's "what is the sword?" (question), it's a question
4. Be generous in identifying command actions - if there's any doubt, prefer identifying it as a command action
5. Only return a commandId if isCommandAction is true and you can identify which command it matches
6. Consider the current game state, scene, and player's inventory when making this determination`,
            prompt: `${contextInfo ? `Game Context:\n${contextInfo}\n\n` : ''}Available Commands:
${availableCommands.map(c => `- ID: "${c.id}" | Description: "${c.text}"`).join('\n')}

${objectsInfo && objectsInfo.length > 0 ? `Objects and Available Actions:
${objectsInfo.map(obj => {
    const locationText = obj.location === 'scene' ? 'in scene' : 'in inventory';
    const actionsText = obj.availableActions.length > 0 
        ? `Actions: ${obj.availableActions.join(', ')}`
        : 'Actions: (none)';
    return `- "${obj.id}": ${obj.description} (${locationText}) - ${actionsText}`;
}).join('\n')}

` : ''}Player Input: "${userInput}"

Determine if this is a COMMAND ACTION (player wants to do something) or a QUESTION (player wants information).
If it's a command action, identify which command ID it matches.
${objectsInfo && objectsInfo.length > 0 ? 'Consider the available actions listed for each object when determining if the input matches a command action.' : ''}`
        });

        logger.log('[determineIfCommandAction] LLM response:', object);
        
        if (object.isCommandAction && object.commandId) {
            const commandExists = availableCommands.find(c => c.id === object.commandId);
            if (commandExists) {
                logger.log(`[determineIfCommandAction] Detected command action: ${object.commandId} (confidence: ${object.confidence})`);
                return { 
                    isCommandAction: true, 
                    commandId: object.commandId, 
                    confidence: object.confidence 
                };
            } else {
                logger.log(`[determineIfCommandAction] Command ${object.commandId} not found in available commands`);
                return { isCommandAction: false, commandId: null, confidence: object.confidence };
            }
        } else {
            logger.log(`[determineIfCommandAction] Input is a question (confidence: ${object.confidence})`);
            return { 
                isCommandAction: false, 
                commandId: null, 
                confidence: object.confidence 
            };
        }
    } catch (error) {
        logger.error('[determineIfCommandAction] LLM analysis failed:', error);
        return { isCommandAction: false, commandId: null, confidence: 0 };
    }
}

/**
 * Answer a general question about the game state using comprehensive context.
 * This function collects all available information about the scene, objects, NPCs, exits,
 * player inventory, stats, traits, flags, and effects to answer the player's question.
 * 
 * @param question The player's general question
 * @param context Comprehensive game context including scene, objects, NPCs, exits, inventory, stats, traits, flags, and effects
 * @param state Optional game state for conversation history
 * @param sceneContext Optional scene context for comprehensive context building
 * @param statCalculator Optional stat calculator for context building
 * @param effectManager Optional effect manager for context building
 * @returns AI-generated answer to the question
 */
export async function answerGeneralQuestion(
    question: string,
    context: {
        sceneNarrative?: string;
        sceneDetailedDescriptions?: DetailedDescription[];
        objects?: Array<{
            object: GameObject;
            detailedDescriptions: DetailedDescription[];
        }>;
        npcs?: Array<{
            npc: import('./types').NPCDefinition;
            detailedDescriptions: DetailedDescription[];
        }>;
        exits?: Array<{
            exit: import('./types').ExitDefinition;
            detailedDescriptions: DetailedDescription[];
        }>;
        inventory?: string;
        stats?: {
            health: number;
            willpower: number;
            perception: number;
            reputation: number;
            strength: number;
            agility: number;
        };
        traits?: string[];
        flags?: string[];
        effects?: Array<{
            id: string;
            name: string;
            description: string;
            duration?: number;
            statModifiers?: Partial<import('./types').StatBlock>;
            perTurnModifiers?: Partial<import('./types').StatBlock>;
        }>;
    },
    state?: GameState,
    sceneContext?: SceneContext,
    statCalculator?: StatCalculator,
    effectManager?: EffectManager
): Promise<string> {
    logger.log('[answerGeneralQuestion] Answering question:', question);
    
    try {
        // Build comprehensive context string with all available information
        let contextInfo = '';
        
        // Scene information
        if (context.sceneNarrative) {
            contextInfo += `Current Scene:\n${context.sceneNarrative}\n\n`;
        }
        
        if (context.sceneDetailedDescriptions && context.sceneDetailedDescriptions.length > 0) {
            contextInfo += 'Scene Additional Details:\n';
            for (const detail of context.sceneDetailedDescriptions) {
                contextInfo += `- ${detail.text}\n`;
            }
            contextInfo += '\n';
        }
        
        // Objects in scene
        if (context.objects && context.objects.length > 0) {
            contextInfo += 'Objects in Scene:\n';
            for (const { object, detailedDescriptions } of context.objects) {
                contextInfo += `- ${object.id}: ${object.description}`;
                if (detailedDescriptions && detailedDescriptions.length > 0) {
                    contextInfo += '\n  Additional details:';
                    for (const detail of detailedDescriptions) {
                        contextInfo += `\n    - ${detail.text}`;
                    }
                }
                contextInfo += '\n';
            }
            contextInfo += '\n';
        }
        
        // NPCs in scene
        if (context.npcs && context.npcs.length > 0) {
            contextInfo += 'NPCs in Scene:\n';
            for (const { npc, detailedDescriptions } of context.npcs) {
                const npcDesc = npc.description || `${npc.name} is here.`;
                contextInfo += `- ${npc.name} (${npc.id}): ${npcDesc}`;
                if (npc.baseStats) {
                    contextInfo += `\n  Stats: health=${npc.baseStats.health}, willpower=${npc.baseStats.willpower}, perception=${npc.baseStats.perception}, reputation=${npc.baseStats.reputation}, strength=${npc.baseStats.strength}, agility=${npc.baseStats.agility}`;
                }
                if (npc.traits && npc.traits.length > 0) {
                    contextInfo += `\n  Traits: ${npc.traits.join(', ')}`;
                }
                if (detailedDescriptions && detailedDescriptions.length > 0) {
                    contextInfo += '\n  Additional details:';
                    for (const detail of detailedDescriptions) {
                        contextInfo += `\n    - ${detail.text}`;
                    }
                }
                contextInfo += '\n';
            }
            contextInfo += '\n';
        }
        
        // Exits from scene
        if (context.exits && context.exits.length > 0) {
            contextInfo += 'Exits from Scene:\n';
            for (const { exit, detailedDescriptions } of context.exits) {
                const exitDesc = exit.description || exit.name || `A ${exit.direction.toUpperCase()} exit.`;
                contextInfo += `- ${exit.direction.toUpperCase()}: ${exitDesc}`;
                if (exit.nextSceneId) {
                    contextInfo += ` (leads to: ${exit.nextSceneId})`;
                }
                if (detailedDescriptions && detailedDescriptions.length > 0) {
                    contextInfo += '\n  Additional details:';
                    for (const detail of detailedDescriptions) {
                        contextInfo += `\n    - ${detail.text}`;
                    }
                }
                contextInfo += '\n';
            }
            contextInfo += '\n';
        }
        
        // Player inventory
        if (context.inventory) {
            contextInfo += `Player Inventory:\n${context.inventory}\n\n`;
        }
        
        // Player stats
        if (context.stats) {
            contextInfo += 'Player Stats:\n';
            contextInfo += `  Health: ${context.stats.health}\n`;
            contextInfo += `  Willpower: ${context.stats.willpower}\n`;
            contextInfo += `  Perception: ${context.stats.perception}\n`;
            contextInfo += `  Reputation: ${context.stats.reputation}\n`;
            contextInfo += `  Strength: ${context.stats.strength}\n`;
            contextInfo += `  Agility: ${context.stats.agility}\n\n`;
        }
        
        // Player traits
        if (context.traits && context.traits.length > 0) {
            contextInfo += `Player Traits: ${context.traits.join(', ')}\n\n`;
        }
        
        // Player flags
        if (context.flags && context.flags.length > 0) {
            contextInfo += `Player Flags: ${context.flags.join(', ')}\n\n`;
        }
        
        // Player effects
        if (context.effects && context.effects.length > 0) {
            contextInfo += 'Player Active Effects:\n';
            for (const effect of context.effects) {
                contextInfo += `  - ${effect.name} (${effect.id}): ${effect.description}`;
                if (effect.duration !== undefined) {
                    contextInfo += ` (${effect.duration} turn${effect.duration !== 1 ? 's' : ''} remaining)`;
                } else {
                    contextInfo += ' (Permanent)';
                }
                if (effect.statModifiers) {
                    const modifiers: string[] = [];
                    for (const [key, value] of Object.entries(effect.statModifiers)) {
                        if (value !== 0) {
                            modifiers.push(`${key}: ${value > 0 ? '+' : ''}${value}`);
                        }
                    }
                    if (modifiers.length > 0) {
                        contextInfo += `\n    Stat modifiers: ${modifiers.join(', ')}`;
                    }
                }
                if (effect.perTurnModifiers) {
                    const perTurnMods: string[] = [];
                    for (const [key, value] of Object.entries(effect.perTurnModifiers)) {
                        if (value !== 0) {
                            perTurnMods.push(`${key}: ${value > 0 ? '+' : ''}${value} per turn`);
                        }
                    }
                    if (perTurnMods.length > 0) {
                        contextInfo += `\n    Per-turn modifiers: ${perTurnMods.join(', ')}`;
                    }
                }
                contextInfo += '\n';
            }
            contextInfo += '\n';
        }
        
        // Add comprehensive game context if available (this will include conversation history)
        let comprehensiveContext = '';
        if (state && sceneContext && statCalculator && effectManager) {
            comprehensiveContext = buildLLMContext(state, sceneContext, statCalculator, effectManager);
        }
        
        logger.log('[answerGeneralQuestion] Calling LLM with comprehensive context...');
        const { text } = await generateText({
            model: openai('gpt-4o'),
            system: `You are a helpful narrator in a text adventure game. The player is asking a general question about the game world, their character, or the current situation.

CRITICAL RULES:
1. You MUST ONLY use information that is explicitly provided in the context below.
2. If the information needed to answer the question is NOT in the provided context, you MUST say that you don't know or that the information isn't available.
3. DO NOT make up, infer, or guess information that isn't explicitly stated in the context.
4. DO NOT use knowledge from outside the game context.
5. If asked about something not mentioned in the context, respond naturally that you don't have that information (e.g., "You don't have that information", "That detail isn't clear", "You're not sure about that").
6. Consider previous conversation history when answering to maintain consistency and context.

Guidelines:
- Answer naturally and conversationally, as if you're describing what the player knows or observes
- Stay consistent with the game's tone and style
- Only use information from the provided context
- If the question can't be answered from the context, say so clearly and naturally
- Keep answers concise but informative
- Write in second person ("you see", "you notice", "you have", etc.)
- Be honest when information is not available
- Reference previous conversations when relevant to provide continuity`,
            prompt: `${comprehensiveContext ? `Comprehensive Game Context:\n${comprehensiveContext}\n\n` : ''}${contextInfo ? `Additional Context:\n${contextInfo}\n\n` : ''}Player's Question: "${question}"

Answer the player's question based ONLY on the context provided above. If the information needed to answer the question is not in the context, clearly state that you don't have that information.`
        });
        
        logger.log('[answerGeneralQuestion] LLM response:', text);
        return text;
    } catch (error) {
        logger.error('[answerGeneralQuestion] Failed to generate answer:', error);
        return "You're not quite sure how to answer that question based on what you know.";
    }
}

/**
 * Generate an NPC's response to a player's message in a conversation.
 * The response is based on the NPC's personality and available key information
 * (filtered by the player's perception stat).
 * 
 * @param playerMessage The player's message to the NPC
 * @param npc The NPC definition with personality and key information
 * @param availableKeyInformation Array of key information items available to the player (filtered by perception)
 * @param state Optional game state for comprehensive context and conversation history
 * @param sceneContext Optional scene context for comprehensive context building
 * @param statCalculator Optional stat calculator for context building
 * @param effectManager Optional effect manager for context building
 * @returns AI-generated NPC response text
 */
export async function generateNPCResponse(
    playerMessage: string,
    npc: import('./types').NPCDefinition,
    availableKeyInformation: Array<{ text: string; perception: number }>,
    state?: GameState,
    sceneContext?: SceneContext,
    statCalculator?: StatCalculator,
    effectManager?: EffectManager
): Promise<string> {
    logger.log('[generateNPCResponse] Generating NPC response for:', npc.id);
    logger.log('[generateNPCResponse] Player message:', playerMessage);
    logger.log(`[generateNPCResponse] Available key information items: ${availableKeyInformation.length}`);
    
    try {
        // Build NPC-specific context
        let npcContext = `NPC: ${npc.name} (${npc.id})\n`;
        
        if (npc.description) {
            npcContext += `Description: ${npc.description}\n`;
        }
        
        if (npc.personality) {
            npcContext += `\nPersonality: ${npc.personality}\n`;
        }
        
        if (npc.baseStats) {
            npcContext += `\nStats: health=${npc.baseStats.health}, willpower=${npc.baseStats.willpower}, perception=${npc.baseStats.perception}, reputation=${npc.baseStats.reputation}, strength=${npc.baseStats.strength}, agility=${npc.baseStats.agility}\n`;
        }
        
        if (npc.traits && npc.traits.length > 0) {
            npcContext += `Traits: ${npc.traits.join(', ')}\n`;
        }
        
        // Add available key information
        if (availableKeyInformation.length > 0) {
            npcContext += `\nAvailable Information (that this NPC knows and can share):\n`;
            for (const info of availableKeyInformation) {
                npcContext += `- ${info.text}\n`;
            }
        } else if (npc.keyInformation && npc.keyInformation.length > 0) {
            // NPC has information but player doesn't have access to it
            npcContext += `\nNote: This NPC has additional information, but you don't have sufficient perception to access it yet.\n`;
        }
        
        // Build comprehensive game context if available
        let comprehensiveContext = '';
        if (state && sceneContext && statCalculator && effectManager) {
            comprehensiveContext = buildLLMContext(state, sceneContext, statCalculator, effectManager);
        }
        
        // Get conversation history for this specific NPC only
        let conversationHistoryContext = '';
        if (state && state.conversationHistory && state.conversationHistory[npc.id]) {
            const npcHistory = state.conversationHistory[npc.id];
            if (npcHistory.length > 0) {
                conversationHistoryContext = '\nPrevious Conversation History with this NPC:\n';
                for (const entry of npcHistory) {
                    conversationHistoryContext += `  Player: ${entry.user}\n`;
                    conversationHistoryContext += `  ${npc.name}: ${entry.assistant}\n\n`;
                }
            }
        }
        
        logger.log('[generateNPCResponse] Calling LLM with NPC context...');
        const { text } = await generateText({
            model: openai('gpt-4o'),
            system: `You are roleplaying as ${npc.name} in a text adventure game. The player is having a conversation with you.

CRITICAL RULES:
1. You MUST roleplay as this NPC based on their personality description. Stay in character at all times.
2. You MUST ONLY use information from the "Available Information" section when responding. Do NOT reveal information that is not listed there.
3. If the player asks about something not in the available information, respond naturally as the NPC would - they may not know, may be evasive, or may refuse to share based on their personality.
4. Your responses should match the NPC's personality traits and behavior patterns.
5. Keep responses concise but natural - this is a conversation, not a monologue.
6. Consider previous conversation history when responding to maintain consistency.
7. If the NPC doesn't have a personality description, respond as a generic helpful NPC.
8. Do NOT break character or reference game mechanics.
9. Do NOT reveal information that isn't in the "Available Information" section, even if you think the player should know it.
10. Respond as if you are the NPC speaking directly to the player (use "I", "you", etc., not third person).

Guidelines:
- Stay consistent with the NPC's personality
- Be natural and conversational
- Only share information that is explicitly in the "Available Information" section
- If asked about unavailable information, respond in character (e.g., "I don't know about that" or "That's not something I can discuss")`,
            prompt: `${comprehensiveContext ? `Game Context:\n${comprehensiveContext}\n\n` : ''}${npcContext}${conversationHistoryContext ? `\n${conversationHistoryContext}\n` : ''}Player's Message: "${playerMessage}"

Respond as ${npc.name} would, based on your personality and the available information you have.`
        });
        
        logger.log('[generateNPCResponse] LLM response:', text);
        return text;
    } catch (error) {
        logger.error('[generateNPCResponse] Failed to generate NPC response:', error);
        return `${npc.name} seems unable to respond right now.`;
    }
}
