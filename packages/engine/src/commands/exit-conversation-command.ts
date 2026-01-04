import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult } from '../types';
import type { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { ParsedCommand } from '../utils/nlp-parser';
import { logger } from '../logger';

export class ExitConversationCommand implements Command {
    getCommandId(): string {
        return 'exit-conversation';
    }

    matchesIntent(intent: ActionIntent): boolean {
        return intent.type === this.getCommandId();
    }

    getAliases(): { singleWords: string[]; phrasalVerbs: string[] } {
        return {
            singleWords: ['goodbye', 'bye'],
            phrasalVerbs: ['exit conversation', 'end conversation', 'leave conversation', 'stop talking', 'end talk']
        };
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({});
    }

    processProcedural(parsed: ParsedCommand, input: string, _context: SceneContext): NormalizedCommandInput | null {
        const lowerInput = input.toLowerCase().trim();
        
        // Check for exit conversation phrases
        const exitPhrases = [
            'exit conversation',
            'end conversation',
            'leave conversation',
            'stop talking',
            'end talk',
            'goodbye',
            'bye',
            'farewell'
        ];

        for (const phrase of exitPhrases) {
            if (lowerInput === phrase || lowerInput.startsWith(phrase + ' ')) {
                return {
                    commandId: 'exit-conversation',
                    parameters: {}
                };
            }
        }

        return null;
    }

    async extractParameters(userInput: string, _context: SceneContext): Promise<NormalizedCommandInput | null> {
        // Check if input matches exit conversation phrases
        const lowerInput = userInput.toLowerCase().trim();
        
        const exitPhrases = [
            'exit conversation',
            'end conversation',
            'leave conversation',
            'stop talking',
            'end talk',
            'goodbye',
            'bye',
            'farewell'
        ];

        for (const phrase of exitPhrases) {
            if (lowerInput === phrase || lowerInput.startsWith(phrase + ' ')) {
                return {
                    commandId: 'exit-conversation',
                    parameters: {}
                };
            }
        }

        // Input doesn't match any exit phrase
        return null;
    }

    execute(input: NormalizedCommandInput, context: SceneContext, originalInput?: string): ActionIntent {
        logger.log('[ExitConversationCommand] Executing exit conversation');
        return {
            actorId: 'player',
            type: 'exit-conversation' as const,
            sceneId: context.id,
            originalInput: originalInput
        };
    }

    resolve(state: GameState, _intent: ActionIntent, _context: SceneContext): ResolutionResult {
        logger.log('[ExitConversationCommand] Resolving exit conversation');
        
        // Check if actually in conversation context
        if (!state.isInConversationContext()) {
            return {
                outcome: 'failure',
                narrativeResolver: "You're not in a conversation.",
                effects: {}
            };
        }

        // Exit the context - this will be handled by the engine
        return {
            outcome: 'success',
            narrativeResolver: "You end the conversation.",
            effects: {}
        };
    }
}


