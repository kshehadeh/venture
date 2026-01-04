import { ActionIntent, GameState } from './types';
import type { SceneContext } from './engine';
import { CommandProcessor } from './command-processor';
import { ProceduralProcessor } from './processors/procedural-processor';
import { AIProcessor } from './processors/ai-processor';
import { CommandRegistry } from './commands/command-registry';
import { logger } from './logger';
import type { StatCalculator } from './stats';
import type { EffectManager } from './effects';

export interface CommandResult {
    intent?: ActionIntent;
    feedback?: string;
    handled: boolean;
    normalizedInput?: NormalizedCommandInput; // For debugging - the normalized command input
}

/**
 * Normalized command input containing all parameters needed to execute a command.
 * This is the output of command processors and input to command classes.
 */
export interface NormalizedCommandInput {
    commandId: string;        // The command ID (e.g., "move", "look", "pickup", "items")
    parameters: {
        // Command-specific parameters extracted from input
        direction?: string;   // For "move" command (e.g., "north", "east")
        speed?: string;       // For "move" command (e.g., "fast", "slow")
        target?: string;      // For "look" (noun), "pickup" (object name)
        // The commandId should match a command from the command registry
        itemId?: string;     // For use_item commands
        [key: string]: any;   // Extensible for future commands
    };
}

// Create singleton command processor and registry
let commandProcessorInstance: CommandProcessor | null = null;
let commandRegistryInstance: CommandRegistry | null = null;

function getCommandProcessor(): CommandProcessor {
    if (!commandProcessorInstance) {
        const registry = getCommandRegistry();
        const processor = new CommandProcessor();
        processor.registerProcessor(new ProceduralProcessor());
        processor.registerProcessor(new AIProcessor(registry));
        commandProcessorInstance = processor;
    }
    return commandProcessorInstance;
}

export function getCommandRegistry(): CommandRegistry {
    if (!commandRegistryInstance) {
        commandRegistryInstance = new CommandRegistry();
    }
    return commandRegistryInstance;
}

/**
 * Parses a raw string input into an actionable intent or provides feedback.
 * 
 * @param input Raw user input string
 * @param sceneCtx The current scene context (containing objects, exits, narrative)
 * @param state Optional game state for LLM context
 * @param statCalculator Optional stat calculator for LLM context
 * @param effectManager Optional effect manager for LLM context
 */
export async function parseCommand(
    input: string,
    sceneCtx: SceneContext,
    state?: GameState,
    statCalculator?: StatCalculator,
    effectManager?: EffectManager
): Promise<CommandResult> {
    logger.log('[parseCommand] Starting command parsing');
    logger.log('[parseCommand] Input:', input);
    logger.log('[parseCommand] Scene context:', { id: sceneCtx.id, objectsCount: sceneCtx.objects?.length || 0, exitsCount: sceneCtx.exits?.length || 0 });
    
    const cleanInput = input.trim();
    if (!cleanInput) {
        logger.log('[parseCommand] Empty input, returning handled: false');
        return { handled: false };
    }

    const processor = getCommandProcessor();
    const registry = getCommandRegistry();
    
    // Check if we're in conversation context
    if (state && state.isInConversationContext()) {
        logger.log('[parseCommand] In conversation context, checking for exit command...');
        
        // First, check if this is an exit conversation command
        const exitCommand = registry.getCommand('exit-conversation');
        if (exitCommand) {
            const exitNormalized = await exitCommand.extractParameters?.(cleanInput, sceneCtx);
            if (exitNormalized && exitNormalized.commandId === 'exit-conversation') {
                logger.log('[parseCommand] Detected exit conversation command');
                try {
                    const intent = exitCommand.execute(exitNormalized, sceneCtx, cleanInput);
                    return {
                        handled: true,
                        intent: intent,
                        normalizedInput: exitNormalized
                    };
                } catch (error) {
                    logger.error('[parseCommand] Error executing exit conversation command:', error);
                }
            }
        }
        
        // Check if this is a "talk to X" command (switching NPCs)
        const talkCommand = registry.getCommand('talk');
        if (talkCommand) {
            const talkNormalized = await processor.process(cleanInput, sceneCtx, state, statCalculator, effectManager);
            if (talkNormalized && talkNormalized.commandId === 'talk' && talkNormalized.parameters.target) {
                // This is a talk command with a target - allow it to proceed
                logger.log('[parseCommand] Detected talk command while in conversation - switching NPC');
                try {
                    const intent = talkCommand.execute(talkNormalized, sceneCtx, cleanInput);
                    return {
                        handled: true,
                        intent: intent,
                        normalizedInput: talkNormalized
                    };
                } catch (error) {
                    logger.error('[parseCommand] Error executing talk command:', error);
                }
            }
        }
        
        // Otherwise, treat input as a message to the active NPC(s)
        logger.log('[parseCommand] Treating input as conversation message');
        const conversationNPCs = state.getConversationNPCs();
        if (conversationNPCs.length > 0) {
            // Use the first NPC (for now, single NPC conversations)
            const npcId = conversationNPCs[0];
            const talkCommand = registry.getCommand('talk');
            if (talkCommand) {
                // Create a normalized input for talk command
                const talkNormalized: NormalizedCommandInput = {
                    commandId: 'talk',
                    parameters: {
                        target: npcId,
                        message: cleanInput
                    }
                };
                try {
                    const intent = talkCommand.execute(talkNormalized, sceneCtx, cleanInput);
                    return {
                        handled: true,
                        intent: intent,
                        normalizedInput: talkNormalized
                    };
                } catch (error) {
                    logger.error('[parseCommand] Error executing talk command for conversation:', error);
                }
            }
        }
    }
    
    // Process input through processors (normal command processing)
    logger.log('[parseCommand] Processing through command processor...');
    const normalizedInput = await processor.process(cleanInput, sceneCtx, state, statCalculator, effectManager);
    
    if (!normalizedInput) {
        logger.log('[parseCommand] No normalized input returned, command not understood');
        return {
            handled: true,
            feedback: `I don't understand "${input}".`
        };
    }

    logger.log('[parseCommand] Normalized input received:', JSON.stringify(normalizedInput, null, 2));

    // Convert normalized input to ActionIntent
    const commandId = normalizedInput.commandId;
    logger.log(`[parseCommand] Command ID: ${commandId}`);
    
    // Check if it's an engine command (has a command class)
    const command = registry.getCommand(commandId);
    if (command) {
        logger.log(`[parseCommand] Command ${commandId} is an engine command, executing...`);
        // Execute command class to create ActionIntent
        try {
            const intent = command.execute(normalizedInput, sceneCtx, cleanInput);
            logger.log('[parseCommand] Command executed successfully, ActionIntent:', JSON.stringify(intent, null, 2));
            return {
                handled: true,
                intent: intent,
                normalizedInput: normalizedInput // Include for debugging
            };
        } catch (error) {
            logger.error(`[parseCommand] Error executing command ${commandId}:`, error);
            return {
                handled: true,
                feedback: error instanceof Error ? error.message : `Failed to execute command: ${commandId}`,
                normalizedInput: normalizedInput // Include for debugging
            };
        }
    } else {
        // Command not found in registry - this shouldn't happen if processors are working correctly
        logger.log(`[parseCommand] Command ${commandId} not found in registry`);
        return {
            handled: true,
            feedback: `Command "${commandId}" is not recognized.`,
            normalizedInput: normalizedInput
        };
    }
}
