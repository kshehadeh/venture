import { ProcessorPlugin } from '../command-processor';
import { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { classifyCommandId, classifyCommand, ChoiceOption } from '../llm';
import { CommandRegistry } from '../commands/command-registry';
import { ENGINE_GLOBAL_ACTIONS } from '../globals';
import { z } from 'zod';
import { logger } from '../logger';

/**
 * AI processor that uses LLM to classify commands and extract parameters.
 * Runs after procedural processor (lower priority) as a fallback.
 */
export class AIProcessor implements ProcessorPlugin {
    priority = 2; // Lower priority - runs after procedural

    constructor(private commandRegistry: CommandRegistry) {}

    async process(input: string, context: SceneContext): Promise<NormalizedCommandInput | null> {
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
        const commandIdResult = await classifyCommandId(cleanInput, availableOptions);
        logger.log(`[AIProcessor] Command ID classification result:`, commandIdResult);
        
        if (!commandIdResult.commandId || commandIdResult.confidence <= 0.6) {
            logger.log(`[AIProcessor] Low confidence (${commandIdResult.confidence}) or no command ID, returning null`);
            return null;
        }

        const commandId = commandIdResult.commandId;
        logger.log(`[AIProcessor] Identified command ID: ${commandId} (confidence: ${commandIdResult.confidence})`);

        // Check if it's an engine command (has a schema)
        const command = this.commandRegistry.getCommand(commandId);
        if (command) {
            logger.log(`[AIProcessor] Command ${commandId} is an engine command, extracting parameters...`);
            // It's an engine command - extract parameters using its schema
            try {
                const schema = command.getParameterSchema();
                logger.log(`[AIProcessor] Using schema for ${commandId}`);
                const result = await classifyCommand(cleanInput, availableOptions, schema);
                logger.log(`[AIProcessor] Parameter extraction result:`, result);
                
                if (result.commandId === commandId && result.confidence > 0.6) {
                    // For pickup, match target against scene objects
                    if (commandId === 'pickup' && result.parameters.target) {
                        logger.log(`[AIProcessor] Pickup command with target: ${result.parameters.target}`);
                        const objects = context.objects || [];
                        logger.log(`[AIProcessor] Available objects: ${objects.map(o => o.id).join(', ')}`);
                        const matchingObject = objects.find(obj => 
                            obj.id.toLowerCase() === result.parameters.target.toLowerCase() ||
                            obj.description.toLowerCase().includes(result.parameters.target.toLowerCase())
                        );
                        
                        if (matchingObject) {
                            logger.log(`[AIProcessor] Matched object: ${matchingObject.id}`);
                            return {
                                commandId: 'pickup',
                                parameters: {
                                    target: matchingObject.id
                                }
                            };
                        }
                        // No matching object found
                        logger.log(`[AIProcessor] No matching object found for "${result.parameters.target}"`);
                        return null;
                    }
                    
                    logger.log(`[AIProcessor] Successfully extracted parameters for ${commandId}`);
                    return {
                        commandId: result.commandId,
                        parameters: result.parameters
                    };
                } else {
                    logger.log(`[AIProcessor] Low confidence (${result.confidence}) or command ID mismatch, returning null`);
                }
            } catch (error) {
                logger.error(`[AIProcessor] Failed to extract parameters for command ${commandId}:`, error);
                return null;
            }
        } else {
            logger.log(`[AIProcessor] Command ${commandId} not found in registry, returning null`);
            return null;
        }

        logger.log('[AIProcessor] Processing failed, returning null');
        return null;
    }
}

