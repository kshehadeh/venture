import { ProcessorPlugin } from '../command-processor';
import { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { ENGINE_GLOBAL_ACTIONS } from '../globals';
import { logger } from '../logger';
import { parseCommand } from '../utils/nlp-parser';
import { getVerbMapper } from '../utils/verb-mapper';

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

        // Check if input is just a direction (special case - no verb needed)
        const directionMap: Record<string, string> = {
            'north': 'n', 'n': 'n',
            'south': 's', 's': 's',
            'west': 'w', 'w': 'w',
            'east': 'e', 'e': 'e',
            'northwest': 'nw', 'nw': 'nw',
            'northeast': 'ne', 'ne': 'ne',
            'southwest': 'sw', 'sw': 'sw',
            'southeast': 'se', 'se': 'se'
        };

        const lowerInput = cleanInput.toLowerCase();
        const directDirection = directionMap[lowerInput];
        if (directDirection && !parsed.verb) {
            logger.log(`[ProceduralProcessor] Matched direct direction: ${directDirection}`);
            return {
                commandId: 'move',
                parameters: {
                    direction: directDirection
                }
            };
        }

        // Map verb to command ID
        const verbToCheck = parsed.verbPhrase || parsed.verb;
        const commandId = verbMapper.mapVerbToCommand(verbToCheck);

        if (!commandId) {
            // If no verb found, check if it's a direct command ID or alias match
            logger.log('[ProceduralProcessor] No verb match, checking direct ID/alias match...');
            const engineGlobalMatch = ENGINE_GLOBAL_ACTIONS.find(g => {
                if (g.id.toLowerCase() === lowerInput) return true;
                if (g.aliases?.some(a => a.toLowerCase() === lowerInput)) return true;
                if (g.text && g.text.toLowerCase() === lowerInput) return true;
                return false;
            });

            if (engineGlobalMatch) {
                logger.log(`[ProceduralProcessor] Found direct match: ${engineGlobalMatch.id}`);
                return this.handleDirectCommand(engineGlobalMatch.id, cleanInput, context);
            }

            logger.log('[ProceduralProcessor] No command match found, returning null');
            return null;
        }

        logger.log(`[ProceduralProcessor] Mapped to command: ${commandId}`);

        // Handle commands that don't require targets
        if (commandId === 'look') {
            // Check if it's "look at" without a target - should return null
            if (parsed.verbPhrase === 'look at' && !parsed.target) {
                logger.log('[ProceduralProcessor] "look at" without target, returning null');
                return null;
            }
            if (!parsed.target) {
                logger.log('[ProceduralProcessor] Look command without target');
                return {
                    commandId: 'look',
                    parameters: {}
                };
            }
        }

        if (commandId === 'items' || commandId === 'effects') {
            logger.log(`[ProceduralProcessor] ${commandId} command (no target needed)`);
            return {
                commandId: commandId,
                parameters: {}
            };
        }

        if (commandId === 'help') {
            // Check if there's a specific command requested (e.g., "help look")
            const helpMatch = cleanInput.match(/^help\s+(.+)$/i);
            if (helpMatch) {
                return {
                    commandId: 'help',
                    parameters: {
                        command: helpMatch[1].trim()
                    }
                };
            }
            return {
                commandId: 'help',
                parameters: {}
            };
        }

        // Handle commands that require targets
        if (commandId === 'pickup') {
            return this.handlePickupCommand(parsed, context);
        }

        if (commandId === 'look') {
            return this.handleLookCommand(parsed, context);
        }

        if (commandId === 'move') {
            return this.handleMoveCommand(parsed, cleanInput, context, directionMap);
        }

        if (commandId === 'transfer') {
            // Transfer command - let AI processor handle complex cases
            logger.log('[ProceduralProcessor] Transfer command, returning null for AI processor');
            return null;
        }

        // For other commands, return null to let AI processor handle
        logger.log(`[ProceduralProcessor] Command ${commandId} not fully handled, returning null`);
        return null;
    }

    /**
     * Handle direct command matches (when input is exactly a command ID or alias).
     */
    private handleDirectCommand(commandId: string, input: string, context: SceneContext): NormalizedCommandInput | null {
        if (commandId === 'look') {
            return { commandId: 'look', parameters: {} };
        }
        if (commandId === 'items') {
            return { commandId: 'items', parameters: {} };
        }
        if (commandId === 'help') {
            const helpMatch = input.match(/^help\s+(.+)$/i);
            if (helpMatch) {
                return {
                    commandId: 'help',
                    parameters: { command: helpMatch[1].trim() }
                };
            }
            return { commandId: 'help', parameters: {} };
        }
        if (commandId === 'effects') {
            return { commandId: 'effects', parameters: {} };
        }
        // For pickup/move without target, return null to let AI processor handle
        return null;
    }

    /**
     * Handle pickup command with target matching.
     */
    private handlePickupCommand(parsed: { verb: string | null; target: string | null; verbPhrase: string | null }, context: SceneContext): NormalizedCommandInput | null {
        if (!parsed.target) {
            logger.log('[ProceduralProcessor] Pickup without target, returning null for AI processor');
            return null;
        }

        const matchedId = this.matchTarget(parsed.target, context, ['objects']);
        if (matchedId) {
            logger.log(`[ProceduralProcessor] Matched pickup target "${parsed.target}" to object: ${matchedId}`);
            return {
                commandId: 'pickup',
                parameters: {
                    target: matchedId
                }
            };
        }

        logger.log(`[ProceduralProcessor] Pickup target "${parsed.target}" not found, returning null`);
        return null;
    }

    /**
     * Handle look command with optional target.
     */
    private handleLookCommand(parsed: { verb: string | null; target: string | null; verbPhrase: string | null }, context: SceneContext): NormalizedCommandInput {
        if (!parsed.target) {
            return {
                commandId: 'look',
                parameters: {}
            };
        }

        // For look commands, preserve the original target case
        // The command will handle the actual matching
        logger.log(`[ProceduralProcessor] Look command with target: "${parsed.target}"`);
        return {
            commandId: 'look',
            parameters: {
                target: parsed.target
            }
        };
    }

    /**
     * Handle move command with direction.
     */
    private handleMoveCommand(parsed: { verb: string | null; target: string | null; verbPhrase: string | null }, input: string, context: SceneContext, directionMap: Record<string, string>): NormalizedCommandInput | null {
        if (!parsed.target) {
            logger.log('[ProceduralProcessor] Move without direction, returning null for AI processor');
            return null;
        }

        // Check if target is a direction
        const lowerTarget = parsed.target.toLowerCase();
        const direction = directionMap[lowerTarget];
        
        if (direction) {
            logger.log(`[ProceduralProcessor] Matched move direction: ${direction}`);
            return {
                commandId: 'move',
                parameters: {
                    direction: direction
                }
            };
        }

        // Try to match against exit names/descriptions
        const matchedExit = this.matchTarget(parsed.target, context, ['exits']);
        if (matchedExit) {
            logger.log(`[ProceduralProcessor] Matched move target to exit: ${matchedExit}`);
            return {
                commandId: 'move',
                parameters: {
                    direction: matchedExit
                }
            };
        }

        logger.log(`[ProceduralProcessor] Move target "${parsed.target}" not recognized, returning null`);
        return null;
    }

    /**
     * Match a target string against entities in the context.
     * @param target The target string to match
     * @param context Scene context
     * @param entityTypes Types of entities to match against: 'objects', 'npcs', 'exits', 'scene'
     * @returns Matched entity ID or null if no match found
     */
    private matchTarget(target: string, context: SceneContext, entityTypes: Array<'objects' | 'npcs' | 'exits' | 'scene'>): string | null {
        const lowerTarget = target.toLowerCase();

        // Remove articles and common determiners for better matching
        const cleanTarget = lowerTarget.replace(/^(the|a|an)\s+/, '').trim();

        // Match against objects
        if (entityTypes.includes('objects') && context.objects) {
            for (const obj of context.objects) {
                const objIdLower = obj.id.toLowerCase();
                const objDescLower = obj.description.toLowerCase();
                
                if (objIdLower === cleanTarget || objIdLower === lowerTarget ||
                    objDescLower.includes(cleanTarget) || objDescLower.includes(lowerTarget)) {
                    return obj.id;
                }
            }
        }

        // Match against NPCs
        if (entityTypes.includes('npcs') && context.npcs) {
            for (const npc of context.npcs) {
                const npcIdLower = npc.id.toLowerCase();
                const npcNameLower = npc.name.toLowerCase();
                
                if (npcIdLower === cleanTarget || npcIdLower === lowerTarget ||
                    npcNameLower.includes(cleanTarget) || npcNameLower.includes(lowerTarget)) {
                    return npc.id;
                }
            }
        }

        // Match against exits
        if (entityTypes.includes('exits') && context.exits) {
            for (const exit of context.exits) {
                const exitDirLower = exit.direction.toLowerCase();
                const exitNameLower = exit.name?.toLowerCase() || '';
                const exitDescLower = exit.description?.toLowerCase() || '';
                
                if (exitDirLower === cleanTarget || exitDirLower === lowerTarget ||
                    exitNameLower.includes(cleanTarget) || exitNameLower.includes(lowerTarget) ||
                    exitDescLower.includes(cleanTarget) || exitDescLower.includes(lowerTarget)) {
                    return exit.direction; // Use direction as ID for exits
                }
            }
        }

        // Match against scene
        if (entityTypes.includes('scene')) {
            if (context.id.toLowerCase() === cleanTarget || context.id.toLowerCase() === lowerTarget ||
                lowerTarget === 'scene') {
                return context.id;
            }
        }

        return null;
    }
}

