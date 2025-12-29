import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult } from '../types';
import type { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { getCommandRegistry } from '../command';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ParsedCommand } from '../utils/nlp-parser';

interface CommandHelp {
    id: string;
    description: string;
    examples: string[];
}

export class HelpCommand implements Command {
    getCommandId(): string {
        return 'help';
    }

    matchesIntent(intent: ActionIntent): boolean {
        return intent.type === this.getCommandId();
    }

    getAliases(): { singleWords: string[]; phrasalVerbs: string[] } {
        return {
            singleWords: ['help', '?', 'commands'],
            phrasalVerbs: []
        };
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({
            command: z.string().optional().describe('Optional command name to get help for')
        });
    }

    processProcedural(_parsed: ParsedCommand, input: string, _context: SceneContext): NormalizedCommandInput | null {
        // Check if there's a specific command requested (e.g., "help look")
        const helpMatch = input.match(/^help\s+(.+)$/i);
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

    async extractParameters(userInput: string): Promise<NormalizedCommandInput | null> {
        const registry = getCommandRegistry();
        const allCommandIds = registry.getAllCommandIds();
        
        try {
            const result = await generateObject({
                model: openai('gpt-4o'),
                schema: z.object({
                    command: z.string().nullable().describe('The command name the player wants help for, or null if they want general help'),
                    confidence: z.number().describe('Confidence level for command extraction')
                }),
                system: `
        You are identifying which command the player wants help for in a text adventure game.
        
        If the player asks for help on a specific command (e.g., "help look", "help pickup"), extract that command name.
        If the player just says "help" or asks for general help, return null.
        
        Available commands: ${allCommandIds.join(', ')}
      `,
                prompt: `
        Player Input: "${userInput}"
        
        Identify the command name the player wants help for, or return null for general help.
      `
            });
            
            const parameters: Record<string, any> = {};
            if (result.object.command && result.object.confidence > 0.5) {
                // Verify the command exists
                if (allCommandIds.includes(result.object.command.toLowerCase())) {
                    parameters.command = result.object.command.toLowerCase();
                }
            }
            
            return {
                commandId: 'help',
                parameters: parameters
            };
        } catch {
            // On error, return help command without parameters (general help)
            return {
                commandId: 'help',
                parameters: {}
            };
        }
    }

    execute(input: NormalizedCommandInput, context: SceneContext, originalInput?: string): ActionIntent {
        const intent = {
            actorId: 'player',
            type: 'help' as const,
            sceneId: context.id,
            targetId: input.parameters.command, // Store the specific command name if provided
            originalInput: originalInput
        };
        return intent;
    }

    resolve(_state: GameState, intent: ActionIntent, _context: SceneContext): ResolutionResult {
        const registry = getCommandRegistry();
        const allCommandIds = registry.getAllCommandIds();
        
        // Define help information for each command
        const commandHelpMap: Record<string, CommandHelp> = {
            'look': {
                id: 'look',
                description: 'Look around the current scene or examine a specific object',
                examples: ['look', 'look around', 'examine sword', 'look at door']
            },
            'items': {
                id: 'items',
                description: 'Display your inventory and all items you are carrying',
                examples: ['items', 'inventory', 'inv', 'i']
            },
            'pickup': {
                id: 'pickup',
                description: 'Pick up an object from the current scene',
                examples: ['pickup sword', 'pick up backpack', 'grab key', 'take torch']
            },
            'move': {
                id: 'move',
                description: 'Move in a direction (north, south, east, west, etc.)',
                examples: ['move north', 'go east', 'n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se']
            },
            'transfer': {
                id: 'transfer',
                description: 'Move an item from one container to another',
                examples: ['transfer sword to backpack', 'move key to left-hand', 'put torch in bag']
            },
            'help': {
                id: 'help',
                description: 'Show this help message with available commands',
                examples: ['help', 'help look', 'help pickup']
            }
        };

        // Build help text
        let narrative = '';
        
        // If a specific command was requested, show only that command's help
        const requestedCommand = intent.targetId?.toLowerCase();
        if (requestedCommand) {
            const help = commandHelpMap[requestedCommand];
            if (help) {
                narrative = `Help for "${help.id.toUpperCase()}":\n\n`;
                narrative += `${help.description}\n\n`;
                narrative += `Examples:\n`;
                for (const example of help.examples) {
                    narrative += `  ${example}\n`;
                }
            } else {
                narrative = `Command "${intent.targetId}" not found.\n\n`;
                narrative += 'Available commands: ' + allCommandIds.join(', ');
            }
        } else {
            // Show all commands
            narrative = 'Available Commands:\n\n';
            
            for (const commandId of allCommandIds) {
                const help = commandHelpMap[commandId];
                if (help) {
                    narrative += `${help.id.toUpperCase()}\n`;
                    narrative += `  ${help.description}\n`;
                    narrative += `  Examples: ${help.examples.join(', ')}\n\n`;
                }
            }

            narrative += 'Type "help <command>" for detailed help on a specific command.';
        }

        return {
            outcome: 'success',
            narrativeResolver: narrative,
            effects: undefined,
            nextSceneId: undefined
        };
    }
}

