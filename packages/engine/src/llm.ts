import { openai } from '@ai-sdk/openai';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { logger } from './logger';
import { DetailedDescription } from './types';
import { GameObject } from './game-object';

// Define the interface for the Choice data we need
export interface ChoiceOption {
    id: string;
    text: string; // The text prompt shown to the user (e.g., "[left] Go left")
}

/**
 * Result of LLM classification with command ID and extracted parameters.
 */
export interface ClassificationResult {
    commandId: string | null;
    parameters: Record<string, any>; // Extracted and validated parameters
    confidence: number;
}

/**
 * Basic classification to identify command ID only (without parameters).
 * Used as a first step before parameter extraction.
 */
export async function classifyCommandId(
    userInput: string,
    availableChoices: ChoiceOption[]
): Promise<{ commandId: string | null; confidence: number }> {
    logger.log('[classifyCommandId] Classifying command ID for input:', userInput);
    logger.log(`[classifyCommandId] Available choices: ${availableChoices.length}`);
    
    if (!availableChoices.length) {
        logger.log('[classifyCommandId] No available choices, returning null');
        return { commandId: null, confidence: 0 };
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
      `,
            prompt: `
        Available Commands:
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
 * @returns The identified target string or null if no target found
 */
export async function identifyTarget(
    userInput: string,
    context: import('./engine').SceneContext,
    commandId: string
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
            prompt: `
        Command ID: "${commandId}"${isQuestion ? ' (input is a question)' : ''}
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
 * Classify user input to identify command ID and extract target(s) only.
 * This is a simplified version that only identifies what the user is referring to,
 * not all parameters. Commands can use AI to figure out what to do with the original input.
 * 
 * @deprecated This function is being replaced by command-specific extractParameters methods.
 * Use identifyTarget() helper function instead.
 * 
 * @param userInput Raw user input string
 * @param availableChoices List of available choices/commands
 * @param context Scene context to help identify targets
 * @returns Classification result with commandId and target parameter (if found)
 */
export async function classifyCommand(
    userInput: string,
    availableChoices: ChoiceOption[],
    context: import('./engine').SceneContext
): Promise<ClassificationResult> {
    logger.log('[classifyCommand] Classifying command and identifying target for input:', userInput);
    if (!availableChoices.length) {
        logger.log('[classifyCommand] No available choices, returning null');
        return { commandId: null, parameters: {}, confidence: 0 };
    }

    try {
        // First, identify the command ID
        logger.log('[classifyCommand] Step 1: Identifying command ID...');
        const commandIdResult = await classifyCommandId(userInput, availableChoices);

        // If command ID is null or low confidence, assume it's a "look" command
        const identifiedCommandId = commandIdResult.commandId || null;
        const useLookFallback = !identifiedCommandId || commandIdResult.confidence <= 0.6;
        
        if (useLookFallback) {
            logger.log('[classifyCommand] Command ID identification failed or low confidence, assuming "look" command');
        }

        // Step 2: Try to identify target(s) only
        const baseCommandId = useLookFallback ? 'look' : identifiedCommandId;
        logger.log(`[classifyCommand] Step 2: Identifying target for command ${baseCommandId}...`);
        
        // Check if input is a question
        const isQuestion = /[?]|^(what|how|why|when|where|who|which|whose|does|do|is|are|can|could|will|would|should)\s/i.test(userInput);
        const effectiveCommandId = isQuestion ? 'look' : baseCommandId;
        
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
        
        // For transfer command, we need to identify both item and destination
        const isTransferCommand = effectiveCommandId === 'transfer';
        
        const targetResult = await generateObject({
            model: openai('gpt-4o'),
            schema: isTransferCommand 
                ? z.object({
                    target: z.string().nullable().describe('The item to transfer (from inventory)'),
                    destination: z.string().nullable().describe('The destination container (e.g., "left-hand", "right-hand", "backpack", or container name)'),
                    confidence: z.number().describe('Confidence level for target identification')
                })
                : z.object({
                    target: z.string().nullable().describe('The target the user is referring to (object, NPC, exit, or scene), or null if no clear target'),
                    confidence: z.number().describe('Confidence level for target identification')
                }),
            system: isTransferCommand
                ? `
        You are identifying the item and destination for a "transfer" command in a text adventure game.
        
        The player wants to move an item from one container to another. You need to identify:
        1. The item to transfer (from the player's inventory)
        2. The destination container (could be "left-hand", "right-hand", or a container name like "backpack")
        
        Common destination containers:
        - "left-hand" or "left hand"
        - "right-hand" or "right hand"
        - Container names like "backpack", "bag", "pouch", etc.
        
        Examples:
        - "transfer sword to left-hand" -> target: "sword", destination: "left-hand"
        - "move key to backpack" -> target: "key", destination: "backpack"
        - "put torch in bag" -> target: "torch", destination: "bag"
      `
                : `
        You are identifying what target the player is referring to in a text adventure game command.
        
        IMPORTANT: If the player input is a question (contains question words like "what", "how", "why", "does", "is", etc., or ends with "?"), 
        assume the command is "look" - the player is trying to examine or get information about something.
        
        Your goal is to identify ONE target (object, NPC, exit, or scene) that the user is referring to in their command.
        If the command doesn't clearly refer to a specific target, return null.
        
        Examples:
        - "look at sword" -> target: "sword"
        - "examine the guard" -> target: "guard" (if guard is an NPC)
        - "what's in the room?" -> target: null (no specific target, but this is a "look" command)
        - "does the sword have writing?" -> target: "sword" (this is a "look" command about the sword)
        - "what does the signpost say?" -> target: "signpost" (this is a "look" command about the signpost)
      `,
            prompt: isTransferCommand
                ? `
        Command ID: "transfer"
        Player Input: "${userInput}"
        
        Identify the item to transfer and the destination container.
        Common destination phrases: "to", "into", "in", "inside"
      `
                : `
        Command ID: "${effectiveCommandId}"${isQuestion ? ' (assumed "look" because input is a question)' : ''}
        Player Input: "${userInput}"
        
        Available Targets in Scene:
        ${availableTargets.length > 0 ? availableTargets.map(t => `- ${t}`).join('\n') : 'None'}
        
        Identify the target the user is referring to, or return null if no clear target is mentioned.
        ${isQuestion ? '\nNote: Since this is a question, treat it as a "look" command and identify what the player wants to examine.' : ''}
      `
        });

        logger.log('[classifyCommand] Target identification result:', targetResult.object);
        
        const parameters: Record<string, any> = {};
        if (targetResult.object.target) {
            if (isTransferCommand) {
                // For transfer, target is the itemId
                parameters.itemId = targetResult.object.target;
            } else {
                parameters.target = targetResult.object.target;
            }
        }
        
        // For transfer command, also include destination
        if (isTransferCommand && 'destination' in targetResult.object && targetResult.object.destination) {
            parameters.destinationContainerId = targetResult.object.destination;
        }
        
        const result = {
            commandId: effectiveCommandId,
            parameters: parameters,
            confidence: Math.min(commandIdResult.confidence, targetResult.object.confidence)
        };
        logger.log('[classifyCommand] Final classification result:', result);
        return result;

    } catch (error) {
        logger.error("[classifyCommand] LLM Classification failed:", error);
        // On error, assume it's a "look" command
        logger.log("[classifyCommand] Error occurred, assuming 'look' command as fallback");
        return { commandId: 'look', parameters: {}, confidence: 0.5 };
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
    }
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
- Write in second person ("you see", "you notice", etc.)`,
            prompt: `Context Information:
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
 * Answer a general question about the game state using comprehensive context.
 * This function collects all available information about the scene, objects, NPCs, exits,
 * player inventory, stats, traits, flags, and effects to answer the player's question.
 * 
 * @param question The player's general question
 * @param context Comprehensive game context including scene, objects, NPCs, exits, inventory, stats, traits, flags, and effects
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
    }
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

Guidelines:
- Answer naturally and conversationally, as if you're describing what the player knows or observes
- Stay consistent with the game's tone and style
- Only use information from the provided context
- If the question can't be answered from the context, say so clearly and naturally
- Keep answers concise but informative
- Write in second person ("you see", "you notice", "you have", etc.)
- Be honest when information is not available`,
            prompt: `Game Context Information:
${contextInfo}

Player's Question: "${question}"

Answer the player's question based ONLY on the context provided above. If the information needed to answer the question is not in the context, clearly state that you don't have that information.`
        });
        
        logger.log('[answerGeneralQuestion] LLM response:', text);
        return text;
    } catch (error) {
        logger.error('[answerGeneralQuestion] Failed to generate answer:', error);
        return "You're not quite sure how to answer that question based on what you know.";
    }
}
