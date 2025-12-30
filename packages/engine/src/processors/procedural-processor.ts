import { ProcessorPlugin } from '../command-processor';
import type { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { ENGINE_GLOBAL_ACTIONS } from '../globals';
import { logger } from '../logger';
import { parseCommand } from '../utils/nlp-parser';
import { getVerbMapper } from '../utils/verb-mapper';
import { getCommandRegistry } from '../command';

/**
 * Procedural processor that uses NLP-based parsing to extract verbs and target nouns from sentences.
 * Runs first (highest priority) for fast, deterministic command parsing.
 */
export class ProceduralProcessor implements ProcessorPlugin {
    priority = 1; // Highest priority - runs first

    async process(input: string, context: SceneContext): Promise<NormalizedCommandInput | null> {
        logger.log('[ProceduralProcessor] Processing input:', input);
        const cleanInput = input.trim();
        if (!cleanInput) {
            logger.log('[ProceduralProcessor] Empty input, returning null');
            return null;
        }

        logger.log('[ProceduralProcessor] Using NLP-based parsing...');

        // Parse the input using NLP to extract verb and target
        const parsed = parseCommand(cleanInput);
        const verbMapper = getVerbMapper();
        const registry = getCommandRegistry();

        // Map verb to command object
        const verbToCheck = parsed.verbPhrase || parsed.verb;
        const command = verbMapper.mapVerbToCommand(verbToCheck);

        if (!command) {
            // If no verb found, check if it's a direct command ID or alias match
            logger.log('[ProceduralProcessor] No verb match, checking direct ID/alias match...');
            const lowerInput = cleanInput.toLowerCase();
            const engineGlobalMatch = ENGINE_GLOBAL_ACTIONS.find(g => {
                if (g.id.toLowerCase() === lowerInput) return true;
                if (g.aliases?.some(a => a.toLowerCase() === lowerInput)) return true;
                if (g.text && g.text.toLowerCase() === lowerInput) return true;
                return false;
            });

            if (engineGlobalMatch) {
                logger.log(`[ProceduralProcessor] Found direct match: ${engineGlobalMatch.id}`);
                const matchedCommand = registry.getCommand(engineGlobalMatch.id);
                if (matchedCommand && matchedCommand.processProcedural) {
                    return matchedCommand.processProcedural(parsed, cleanInput, context);
                }
            }

            // Try SetStateCommand as a fallback - it can match action names from object states
            logger.log('[ProceduralProcessor] No direct match, trying SetStateCommand for object state actions...');
            const setStateCommand = registry.getCommand('set-state');
            if (setStateCommand && setStateCommand.processProcedural) {
                const result = setStateCommand.processProcedural(parsed, cleanInput, context);
                if (result) {
                    logger.log('[ProceduralProcessor] SetStateCommand matched object state action');
                    return result;
                }
            }

            logger.log('[ProceduralProcessor] No command match found, returning null');
            return null;
        }

        logger.log(`[ProceduralProcessor] Mapped to command: ${command.getCommandId()}`);

        // Use the command's processProcedural method
        if (command.processProcedural) {
            const result = command.processProcedural(parsed, cleanInput, context);
            if (result) {
                logger.log(`[ProceduralProcessor] Command ${command.getCommandId()} processed procedurally`);
                return result;
            }
        }

        // If command doesn't have processProcedural or it returned null, let AI processor handle it
        logger.log(`[ProceduralProcessor] Command ${command.getCommandId()} not handled procedurally, returning null for AI processor`);
        return null;
    }

}

