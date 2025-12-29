import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult, Direction } from '../types';
import type { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { validateRequirements } from '../validation';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ParsedCommand } from '../utils/nlp-parser';

export class MoveCommand implements Command {
    getCommandId(): string {
        return 'move';
    }

    matchesIntent(intent: ActionIntent): boolean {
        return intent.type === this.getCommandId();
    }

    getAliases(): { singleWords: string[]; phrasalVerbs: string[] } {
        return {
            singleWords: ['move', 'go', 'walk', 'travel', 'head'],
            phrasalVerbs: ['go to']
        };
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({
            direction: z.enum(['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se']).describe('Direction to move (n, s, w, e, nw, ne, sw, se)')
        });
    }

    processProcedural(parsed: ParsedCommand, input: string, context: SceneContext): NormalizedCommandInput | null {
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

        const lowerInput = input.toLowerCase();
        const directDirection = directionMap[lowerInput];
        if (directDirection && !parsed.verb) {
            logger.log(`[MoveCommand] Matched direct direction: ${directDirection}`);
            return {
                commandId: 'move',
                parameters: {
                    direction: directDirection
                }
            };
        }

        if (!parsed.target) {
            logger.log('[MoveCommand] Move without direction, returning null');
            return null;
        }

        // Check if target is a direction
        const lowerTarget = parsed.target.toLowerCase();
        const direction = directionMap[lowerTarget];
        
        if (direction) {
            logger.log(`[MoveCommand] Matched move direction: ${direction}`);
            return {
                commandId: 'move',
                parameters: {
                    direction: direction
                }
            };
        }

        // Try to match against exit names/descriptions
        const matchedExit = this.matchTarget(parsed.target, context);
        if (matchedExit) {
            logger.log(`[MoveCommand] Matched move target to exit: ${matchedExit}`);
            return {
                commandId: 'move',
                parameters: {
                    direction: matchedExit
                }
            };
        }

        logger.log(`[MoveCommand] Move target "${parsed.target}" not recognized, returning null`);
        return null;
    }

    /**
     * Match a target string against exits in the scene context.
     */
    private matchTarget(target: string, context: SceneContext): string | null {
        const lowerTarget = target.toLowerCase();
        const cleanTarget = lowerTarget.replace(/^(the|a|an)\s+/, '').trim();

        if (context.exits) {
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

        return null;
    }

    async extractParameters(userInput: string, context: SceneContext): Promise<NormalizedCommandInput | null> {
        logger.log('[MoveCommand] Extracting parameters from input:', userInput);
        
        // Build list of available exits
        const exits = context.exits || [];
        const availableExits = exits.map(e => `${e.direction} (${e.name || e.description || e.direction})`).join(', ');
        
        try {
            const result = await generateObject({
                model: openai('gpt-4o'),
                schema: z.object({
                    direction: z.enum(['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se']).nullable().describe('The direction to move (n, s, w, e, nw, ne, sw, se)'),
                    confidence: z.number().describe('Confidence level for direction extraction')
                }),
                system: `
        You are identifying the direction for a "move" command in a text adventure game.
        
        Valid directions are:
        - n (north)
        - s (south)
        - w (west)
        - e (east)
        - nw (northwest)
        - ne (northeast)
        - sw (southwest)
        - se (southeast)
        
        Map natural language to these abbreviations:
        - "north", "go north", "move north", "n" -> n
        - "south", "go south", "move south", "s" -> s
        - "west", "go west", "move west", "w" -> w
        - "east", "go east", "move east", "e" -> e
        - "northwest", "go northwest", "nw" -> nw
        - "northeast", "go northeast", "ne" -> ne
        - "southwest", "go southwest", "sw" -> sw
        - "southeast", "go southeast", "se" -> se
      `,
                prompt: `
        Player Input: "${userInput}"
        
        Available Exits: ${availableExits || 'None'}
        
        Identify the direction the player wants to move. Return null if no clear direction is mentioned.
      `
            });
            
            logger.log('[MoveCommand] Parameter extraction result:', result.object);
            
            if (result.object.direction && result.object.confidence > 0.5) {
                // Verify the direction matches an available exit
                const exit = exits.find(e => e.direction === result.object.direction);
                if (exit) {
                    return {
                        commandId: 'move',
                        parameters: {
                            direction: result.object.direction
                        }
                    };
                } else {
                    logger.log(`[MoveCommand] Direction ${result.object.direction} not available in scene`);
                }
            }
            
            return null;
        } catch (error) {
            logger.error('[MoveCommand] Failed to extract parameters:', error);
            return null;
        }
    }

    execute(input: NormalizedCommandInput, context: SceneContext, originalInput?: string): ActionIntent {
        logger.log('[MoveCommand] Executing with input:', JSON.stringify(input, null, 2));
        
        const direction = input.parameters.direction as Direction;
        if (!direction) {
            logger.error('[MoveCommand] No direction parameter provided');
            throw new Error('Move command requires a direction parameter');
        }

        // Validate direction is valid
        const validDirections: Direction[] = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];
        if (!validDirections.includes(direction)) {
            logger.error(`[MoveCommand] Invalid direction: ${direction}`);
            throw new Error(`Invalid direction: ${direction}. Must be one of: ${validDirections.join(', ')}`);
        }

        // Check if exit exists in scene
        const exits = context.exits || [];
        const exit = exits.find(e => e.direction === direction);
        
        if (!exit) {
            // Try to find by name as fallback
            const exitByName = exits.find(e => 
                e.name?.toLowerCase() === direction.toLowerCase() ||
                e.description?.toLowerCase().includes(direction.toLowerCase())
            );
            
            if (!exitByName) {
                logger.error(`[MoveCommand] No exit found for direction: ${direction}`);
                throw new Error(`No exit found in direction ${direction.toUpperCase()}`);
            }
        }

        logger.log(`[MoveCommand] Found exit for direction: ${direction}, creating ActionIntent`);
        const intent: ActionIntent = {
            actorId: 'player',
            type: 'move',
            targetId: direction, // Store direction as targetId
            sceneId: context.id,
            originalInput: originalInput
        };
        logger.log('[MoveCommand] ActionIntent created:', JSON.stringify(intent, null, 2));
        return intent;
    }

    resolve(state: GameState, intent: ActionIntent, context: SceneContext): ResolutionResult {
        if (!intent.targetId) {
            return {
                outcome: 'failure',
                narrativeResolver: "Move where?",
                effects: undefined
            };
        }

        // Find exit by direction
        const exits = context.exits || [];
        const direction = intent.targetId as Direction;
        const exit = exits.find(e => e.direction === direction);
        
        if (!exit) {
            // Try to find by name if direction doesn't match
            const exitByName = exits.find(e => 
                e.name?.toLowerCase() === direction.toLowerCase() ||
                e.description?.toLowerCase().includes(direction.toLowerCase())
            );
            
            if (exitByName) {
                // Validate requirements if present
                if (exitByName.requirements) {
                    const valResult = validateRequirements(state, exitByName.requirements, intent.actorId || 'player');
                    if (!valResult.valid) {
                        return {
                            outcome: 'failure',
                            narrativeResolver: valResult.reason,
                            effects: undefined
                        };
                    }
                }

                const exitName = exitByName.name || exitByName.description || exitByName.direction.toUpperCase();
                return {
                    outcome: 'success',
                    narrativeResolver: `You move ${exitName ? `through the ${exitName}` : exitByName.direction.toUpperCase()}.`,
                    effects: undefined,
                    nextSceneId: exitByName.nextSceneId
                };
            }

            return {
                outcome: 'failure',
                narrativeResolver: `You can't go ${direction.toUpperCase()} from here.`,
                effects: undefined
            };
        }

        // Validate nextSceneId exists
        if (!exit.nextSceneId) {
            return {
                outcome: 'failure',
                narrativeResolver: `The exit ${exit.direction.toUpperCase()} doesn't lead anywhere.`,
                effects: undefined
            };
        }

        // Validate requirements if present
        if (exit.requirements) {
            const valResult = validateRequirements(state, exit.requirements, intent.actorId || 'player');
            if (!valResult.valid) {
                return {
                    outcome: 'failure',
                    narrativeResolver: valResult.reason,
                    effects: undefined
                };
            }
        }

        // Success - create narrative
        const exitName = exit.name || exit.description || exit.direction.toUpperCase();
        const narrative = exit.description 
            ? `You ${exit.type === 'door' ? 'open the door and ' : ''}move ${exit.description ? `through ${exit.description}` : `${exit.direction.toUpperCase()}`}.`
            : `You move ${exitName ? `through the ${exitName}` : exit.direction.toUpperCase()}.`;

        return {
            outcome: 'success',
            narrativeResolver: narrative,
            effects: undefined,
            nextSceneId: exit.nextSceneId
        };
    }
}

