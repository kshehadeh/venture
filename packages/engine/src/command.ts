import { ActionIntent } from './types';
import type { SceneContext } from './engine';
import { CommandProcessor } from './command-processor';
import { ProceduralProcessor } from './processors/procedural-processor';
import { AIProcessor } from './processors/ai-processor';
import { CommandRegistry } from './commands/command-registry';
import { logger } from './logger';

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
 */
export async function parseCommand(
    input: string,
    sceneCtx: SceneContext
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
    
    // Process input through processors
    logger.log('[parseCommand] Processing through command processor...');
    const normalizedInput = await processor.process(cleanInput, sceneCtx);
    
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
