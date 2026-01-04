import { ProcessorPlugin } from '../command-processor';
import type { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { classifyCommandId, ChoiceOption } from '../llm';
import { CommandRegistry } from '../commands/command-registry';
import { ENGINE_GLOBAL_ACTIONS } from '../globals';
import { logger } from '../logger';
import type { GameState } from '../types';
import type { StatCalculator } from '../stats';
import type { EffectManager } from '../effects';

/**
 * AI processor that uses LLM to classify commands and extract parameters.
 * Runs after procedural processor (lower priority) as a fallback.
 */
export class AIProcessor implements ProcessorPlugin {
    priority = 2; // Lower priority - runs after procedural

    constructor(private commandRegistry: CommandRegistry) {}

    async process(
        input: string, 
        context: SceneContext,
        state?: GameState,
        statCalculator?: StatCalculator,
        effectManager?: EffectManager
    ): Promise<NormalizedCommandInput | null> {
        logger.log('[AIProcessor] Processing input:', input);
        const cleanInput = input.trim();
        if (!cleanInput) {
            logger.log('[AIProcessor] Empty input, returning null');
            return null;
        }

        // Build list of available commands from the registry
        const allCommandIds = this.commandRegistry.getAllCommandIds();
        const availableOptions: ChoiceOption[] = allCommandIds.map(id => {
            // Get display text from engine globals if available, otherwise use command ID
            const engineGlobal = ENGINE_GLOBAL_ACTIONS.find(g => g.id === id);
            return {
                id: id,
                text: engineGlobal?.text || id
            };
        });

        logger.log(`[AIProcessor] Available commands from registry: ${availableOptions.length}`);

        // First, identify the command ID
        logger.log('[AIProcessor] Classifying command ID...');
        const commandIdResult = await classifyCommandId(cleanInput, availableOptions, state, context, statCalculator, effectManager);
        logger.log(`[AIProcessor] Command ID classification result:`, commandIdResult);
        
        // Check if input is a question
        const isQuestion = this.isQuestion(cleanInput);
        
        // If command ID is null or low confidence, check if it's a question
        let commandId = commandIdResult.commandId;
        if (!commandId || commandIdResult.confidence <= 0.6) {
            if (isQuestion) {
                logger.log(`[AIProcessor] Low confidence (${commandIdResult.confidence}) or no command ID, but input is a question - using "query" command`);
                commandId = 'query';
            } else {
                logger.log(`[AIProcessor] Low confidence (${commandIdResult.confidence}) or no command ID, assuming "look" command`);
                commandId = 'look';
            }
        }

        logger.log(`[AIProcessor] Using command ID: ${commandId} (confidence: ${commandIdResult.confidence})`);

        // Check if it's an engine command
        const command = this.commandRegistry.getCommand(commandId);
        if (command) {
            logger.log(`[AIProcessor] Command ${commandId} is an engine command, delegating parameter extraction to command...`);
            
            // Delegate parameter extraction to the command class
            if (command.extractParameters) {
                try {
                    const normalizedInput = await command.extractParameters(cleanInput, context);
                    if (normalizedInput) {
                        logger.log(`[AIProcessor] Command ${commandId} extracted parameters:`, JSON.stringify(normalizedInput, null, 2));
                        return normalizedInput;
                    } else {
                        logger.log(`[AIProcessor] Command ${commandId} could not extract parameters, returning null`);
                        // If it's a "look" command fallback, return it anyway (let command handle it)
                        if (commandId === 'look') {
                            logger.log(`[AIProcessor] Returning look command without parameters as fallback`);
                            return {
                                commandId: 'look',
                                parameters: {}
                            };
                        }
                        return null;
                    }
                } catch (error) {
                    logger.error(`[AIProcessor] Error extracting parameters for command ${commandId}:`, error);
                    // If it's a "look" command fallback, return it anyway
                    if (commandId === 'look') {
                        logger.log(`[AIProcessor] Error occurred but command is "look", returning look command as fallback`);
                        return {
                            commandId: 'look',
                            parameters: {}
                        };
                    }
                    return null;
                }
            } else {
                // Command doesn't implement extractParameters - return command without parameters
                logger.log(`[AIProcessor] Command ${commandId} does not implement extractParameters, returning command without parameters`);
                return {
                    commandId: commandId,
                    parameters: {}
                };
            }
        } else {
            logger.log(`[AIProcessor] Command ${commandId} not found in registry, returning null`);
            return null;
        }

        logger.log('[AIProcessor] Processing failed, returning null');
        return null;
    }

    /**
     * Check if the input appears to be a question.
     * Detects question words, question marks, and question-like patterns.
     */
    private isQuestion(input: string): boolean {
        const lowerInput = input.toLowerCase().trim();
        
        // Check for question mark
        if (lowerInput.includes('?')) {
            return true;
        }
        
        // Check for question words at the start or after a space
        const questionWords = [
            'what', 'how', 'why', 'when', 'where', 'who', 'which', 'whose',
            'does', 'do', 'is', 'are', 'can', 'could', 'will', 'would', 'should',
            'did', 'was', 'were', 'has', 'have', 'had', 'may', 'might', 'must'
        ];
        
        // Check if input starts with a question word
        for (const word of questionWords) {
            if (lowerInput.startsWith(word + ' ') || lowerInput === word) {
                return true;
            }
        }
        
        // Check if input contains question words (not just at start)
        // This catches patterns like "tell me what..." or "I wonder how..."
        for (const word of questionWords) {
            if (lowerInput.includes(' ' + word + ' ') || lowerInput.endsWith(' ' + word)) {
                return true;
            }
        }
        
        return false;
    }
}

