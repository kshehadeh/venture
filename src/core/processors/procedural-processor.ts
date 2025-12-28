import { ProcessorPlugin } from '../command-processor';
import { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { ENGINE_GLOBAL_ACTIONS } from '../globals';
import { logger } from '../logger';

/**
 * Procedural processor that uses pattern matching and direct lookups to extract command parameters.
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

        const lowerInput = cleanInput.toLowerCase();
        logger.log('[ProceduralProcessor] Checking patterns...');

        // 1. Check for pickup commands with object targeting
        // Patterns: "pick up <object>", "grab <object>", "take <object>", "get <object>"
        const pickupPatterns = ['pick up', 'grab', 'take', 'get'];
        for (const pattern of pickupPatterns) {
            if (lowerInput.startsWith(pattern)) {
                logger.log(`[ProceduralProcessor] Matched pickup pattern: "${pattern}"`);
                const objectName = cleanInput.substring(pattern.length).trim();
                if (objectName) {
                    logger.log(`[ProceduralProcessor] Looking for object: "${objectName}"`);
                    // Find object in scene by ID or description
                    const objects = context.objects || [];
                    logger.log(`[ProceduralProcessor] Available objects: ${objects.map(o => o.id).join(', ')}`);
                    const matchingObject = objects.find(obj => 
                        obj.id.toLowerCase() === objectName.toLowerCase() ||
                        obj.description.toLowerCase().includes(objectName.toLowerCase())
                    );
                    
                    if (matchingObject) {
                        logger.log(`[ProceduralProcessor] Found matching object: ${matchingObject.id}`);
                        return {
                            commandId: 'pickup',
                            parameters: {
                                target: matchingObject.id // Use the matched object ID
                            }
                        };
                    } else {
                        logger.log(`[ProceduralProcessor] Object "${objectName}" not found in scene`);
                        // Object not found - return null to let other processors try
                        return null;
                    }
                }
            }
        }

        // 2. Check for "look" or "look at <target>"
        if (lowerInput === 'look' || lowerInput === 'l') {
            logger.log('[ProceduralProcessor] Matched "look" command');
            return {
                commandId: 'look',
                parameters: {}
            };
        }
        
        if (lowerInput.startsWith('look at ')) {
            const target = cleanInput.substring(8).trim();
            logger.log(`[ProceduralProcessor] Matched "look at" with target: "${target}"`);
            return {
                commandId: 'look',
                parameters: {
                    target: target
                }
            };
        }

        // 2.1. Check for "help" command
        if (lowerInput === 'help' || lowerInput === '?' || lowerInput === 'commands') {
            logger.log('[ProceduralProcessor] Matched "help" command');
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

        // 2.5. Check for move commands (go north, move east, etc.)
        const movePatterns = ['go ', 'move ', 'walk ', 'travel '];
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

        for (const pattern of movePatterns) {
            if (lowerInput.startsWith(pattern)) {
                const directionStr = cleanInput.substring(pattern.length).trim().toLowerCase();
                const direction = directionMap[directionStr];
                if (direction) {
                    logger.log(`[ProceduralProcessor] Matched move pattern "${pattern}" with direction: ${direction}`);
                    return {
                        commandId: 'move',
                        parameters: {
                            direction: direction
                        }
                    };
                }
            }
        }

        // Also check if input is just a direction
        const directDirection = directionMap[lowerInput];
        if (directDirection) {
            logger.log(`[ProceduralProcessor] Matched direct direction: ${directDirection}`);
            return {
                commandId: 'move',
                parameters: {
                    direction: directDirection
                }
            };
        }

        // 3. Direct ID or Alias Match for engine globals
        logger.log('[ProceduralProcessor] Checking direct ID/alias match for engine globals...');
        const engineGlobalMatch = ENGINE_GLOBAL_ACTIONS.find(g => {
            if (g.id.toLowerCase() === lowerInput) return true;
            if (g.aliases?.some(a => a.toLowerCase() === lowerInput)) return true;
            if (g.text && g.text.toLowerCase() === lowerInput) return true;
            return false;
        });

        if (engineGlobalMatch) {
            logger.log(`[ProceduralProcessor] Found engine global match: ${engineGlobalMatch.id}`);
            // Return normalized input for engine command
            // For look/items, no parameters needed
            if (engineGlobalMatch.id === 'look') {
                return {
                    commandId: 'look',
                    parameters: {}
                };
            } else if (engineGlobalMatch.id === 'items') {
                return {
                    commandId: 'items',
                    parameters: {}
                };
            } else if (engineGlobalMatch.id === 'help') {
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
            } else if (engineGlobalMatch.id === 'pickup') {
                logger.log('[ProceduralProcessor] Pickup without target, returning null for AI processor');
                // Pickup without target - return null to let AI processor handle it
                return null;
            } else if (engineGlobalMatch.id === 'move') {
                logger.log('[ProceduralProcessor] Move without direction, returning null for AI processor');
                // Move without direction - return null to let AI processor handle it
                return null;
            }
        }

        logger.log('[ProceduralProcessor] All patterns failed, returning null');
        return null;
    }
}

