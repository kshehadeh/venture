import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { logger } from './logger';

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
                confidence: z.number().describe('Confidence level between 0 and 1'),
                reasoning: z.string().describe('Quick explanation of why this command matches')
            }),
            system: `
        You are a dungeon master assistant interpreting player commands in a text adventure game.
        
        Current context:
        The player is presented with a list of specific commands/choices.
        Your goal is to map the player's natural language input to ONE of these valid command IDs.
        
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
 * Classify user input to identify command ID and extract parameters using a Zod schema.
 * 
 * @param userInput Raw user input string
 * @param availableChoices List of available choices/commands
 * @param parameterSchema Zod schema for the command's parameters (required)
 * @returns Classification result with commandId and validated parameters
 */
export async function classifyCommand(
    userInput: string,
    availableChoices: ChoiceOption[],
    parameterSchema: z.ZodSchema
): Promise<ClassificationResult> {
    logger.log('[classifyCommand] Classifying command with schema for input:', userInput);
    if (!availableChoices.length) {
        logger.log('[classifyCommand] No available choices, returning null');
        return { commandId: null, parameters: {}, confidence: 0 };
    }

    try {
        // First, identify the command ID
        logger.log('[classifyCommand] Step 1: Identifying command ID...');
        const commandIdResult = await classifyCommandId(userInput, availableChoices);

        if (!commandIdResult.commandId || commandIdResult.confidence <= 0.6) {
            logger.log('[classifyCommand] Command ID identification failed or low confidence');
            return {
                commandId: null,
                parameters: {},
                confidence: commandIdResult.confidence
            };
        }

        // Now extract parameters using the provided schema
        logger.log(`[classifyCommand] Step 2: Extracting parameters for command ${commandIdResult.commandId}...`);
        const parameterResult = await generateObject({
            model: openai('gpt-4o'),
            schema: z.object({
                parameters: parameterSchema.describe('Extracted command parameters'),
                confidence: z.number().describe('Confidence level for parameter extraction')
            }),
            system: `
        You are extracting structured parameters from a player's command in a text adventure game.
        
        Extract the parameters based on the provided schema. If a parameter is optional and not present in the input, omit it.
        Be precise and only extract what is explicitly stated or strongly implied.
      `,
            prompt: `
        Command ID: "${commandIdResult.commandId}"
        Player Input: "${userInput}"
        
        Extract the parameters from the input according to the schema.
      `
        });

        logger.log('[classifyCommand] Parameter extraction result:', parameterResult.object);
        const result = {
            commandId: commandIdResult.commandId,
            parameters: parameterResult.object.parameters || {},
            confidence: Math.min(commandIdResult.confidence, parameterResult.object.confidence)
        };
        logger.log('[classifyCommand] Final classification result:', result);
        return result;

    } catch (error) {
        logger.error("[classifyCommand] LLM Classification failed:", error);
        return { commandId: null, parameters: {}, confidence: 0 };
    }
}
