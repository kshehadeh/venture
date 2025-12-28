import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult } from '../types';
import { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { getCommandRegistry } from '../command';

interface CommandHelp {
    id: string;
    description: string;
    examples: string[];
}

export class HelpCommand implements Command {
    getCommandId(): string {
        return 'help';
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({
            command: z.string().optional().describe('Optional command name to get help for')
        });
    }

    execute(input: NormalizedCommandInput, context: SceneContext): ActionIntent {
        const intent = {
            actorId: 'player',
            type: 'choice' as const,
            choiceId: 'help',
            sceneId: context.id,
            targetId: input.parameters.command // Store the specific command name if provided
        };
        return intent;
    }

    resolve(state: GameState, intent: ActionIntent, context: SceneContext): ResolutionResult {
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

            // Add note about scene-specific choices
            narrative += 'Note: Each scene may also have specific choices available. ';
            narrative += 'You can select them by number (1, 2, 3...) or by typing their name or alias.\n\n';
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

