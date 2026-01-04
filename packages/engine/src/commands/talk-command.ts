import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult, NPCDefinition } from '../types';
import type { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { StatCalculator } from '../stats';
import { EffectManager } from '../effects';
import { identifyTarget, generateNPCResponse } from '../llm';
import { ParsedCommand } from '../utils/nlp-parser';
import { GameObject } from '../game-object';

export class TalkCommand implements Command {
    getCommandId(): string {
        return 'talk';
    }

    matchesIntent(intent: ActionIntent): boolean {
        return intent.type === this.getCommandId();
    }

    getAliases(): { singleWords: string[]; phrasalVerbs: string[] } {
        return {
            singleWords: ['talk', 'speak', 'chat', 'converse', 'say'],
            phrasalVerbs: ['talk to', 'speak to', 'chat with', 'say to']
        };
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({
            target: z.string().describe('NPC ID to talk to'),
            message: z.string().optional().describe('Optional message to say to the NPC')
        });
    }

    processProcedural(parsed: ParsedCommand, input: string, context: SceneContext): NormalizedCommandInput | null {
        // Check if we have a target (NPC)
        if (!parsed.target) {
            logger.log('[TalkCommand] No target provided, returning null');
            return null;
        }

        // Try to match the target to an NPC
        const matchedNPC = this.matchNPC(parsed.target, context);
        if (!matchedNPC) {
            logger.log(`[TalkCommand] Target "${parsed.target}" does not match any NPC, returning null`);
            return null;
        }

        // Extract message from input
        // If the input is like "talk to guard about the key", extract "about the key" as the message
        let message: string | undefined;
        const lowerInput = input.toLowerCase();
        const targetLower = parsed.target.toLowerCase();
        
        // Try to find the message part after the target
        const targetIndex = lowerInput.indexOf(targetLower);
        if (targetIndex !== -1) {
            const afterTarget = input.substring(targetIndex + targetLower.length).trim();
            // Remove common connecting words
            const messageStarters = ['about', 'regarding', 'concerning', 'that', 'how', 'what', 'why', 'when', 'where'];
            for (const starter of messageStarters) {
                if (afterTarget.toLowerCase().startsWith(starter + ' ')) {
                    message = afterTarget.substring(starter.length).trim();
                    break;
                }
            }
            if (!message && afterTarget.length > 0) {
                message = afterTarget;
            }
        }

        logger.log(`[TalkCommand] Procedural match: NPC=${matchedNPC.id}, message="${message || ''}"`);
        return {
            commandId: 'talk',
            parameters: {
                target: matchedNPC.id,
                message: message
            }
        };
    }

    async extractParameters(userInput: string, context: SceneContext): Promise<NormalizedCommandInput | null> {
        logger.log('[TalkCommand] Extracting parameters from input:', userInput);
        
        // Try to identify NPC target
        const target = await identifyTarget(userInput, context, 'talk');
        
        if (!target) {
            logger.log('[TalkCommand] No target identified, returning null');
            return null;
        }

        // Try to match the target to an NPC
        const matchedNPC = this.matchNPC(target, context);
        if (!matchedNPC) {
            logger.log(`[TalkCommand] Target "${target}" does not match any NPC, returning null`);
            return null;
        }

        // Extract message from input
        // Remove the talk command and NPC name to get the message
        let message: string | undefined;
        const lowerInput = userInput.toLowerCase();
        const npcNameLower = matchedNPC.name.toLowerCase();
        const npcIdLower = matchedNPC.id.toLowerCase();
        
        // Try to find message after NPC name or ID
        const nameIndex = lowerInput.indexOf(npcNameLower);
        const idIndex = lowerInput.indexOf(npcIdLower);
        const targetIndex = Math.max(nameIndex, idIndex);
        
        if (targetIndex !== -1) {
            const afterTarget = userInput.substring(targetIndex + (nameIndex > idIndex ? npcNameLower.length : npcIdLower.length)).trim();
            // Remove common connecting words
            const messageStarters = ['about', 'regarding', 'concerning', 'that', 'how', 'what', 'why', 'when', 'where'];
            for (const starter of messageStarters) {
                if (afterTarget.toLowerCase().startsWith(starter + ' ')) {
                    message = afterTarget.substring(starter.length).trim();
                    break;
                }
            }
            if (!message && afterTarget.length > 0) {
                message = afterTarget;
            }
        }

        // If no explicit message, use the full input as context (the AI will interpret it)
        if (!message) {
            message = userInput;
        }

        logger.log(`[TalkCommand] Extracted: NPC=${matchedNPC.id}, message="${message}"`);
        return {
            commandId: 'talk',
            parameters: {
                target: matchedNPC.id,
                message: message
            }
        };
    }

    execute(input: NormalizedCommandInput, context: SceneContext, originalInput?: string): ActionIntent {
        logger.log('[TalkCommand] Executing with input:', JSON.stringify(input, null, 2));
        
        const target = input.parameters.target;
        const message = input.parameters.message;

        if (!target) {
            logger.log('[TalkCommand] No target provided in parameters');
            throw new Error('Talk command requires an NPC target');
        }

        // Verify NPC exists in context
        const npc = this.matchNPC(target, context);
        if (!npc) {
            logger.log(`[TalkCommand] NPC "${target}" not found in scene`);
            throw new Error(`NPC "${target}" not found in current scene`);
        }

        // Ensure originalInput contains the full player message for conversation history
        // If we have a message parameter, use it; otherwise use the original input
        const fullMessage = message || originalInput || `talk to ${npc.name}`;

        const intent: ActionIntent = {
            actorId: 'player',
            type: 'talk' as const,
            sceneId: context.id,
            targetId: npc.id,
            originalInput: fullMessage
        };

        logger.log('[TalkCommand] ActionIntent created:', JSON.stringify(intent, null, 2));
        return intent;
    }

    async resolve(
        state: GameState,
        intent: ActionIntent,
        context: SceneContext,
        statCalculator?: StatCalculator,
        effectManager?: EffectManager
    ): Promise<ResolutionResult> {
        logger.log('[TalkCommand] Resolving talk action:', JSON.stringify(intent, null, 2));

        if (!intent.targetId) {
            return {
                outcome: 'failure',
                narrativeResolver: "You need to specify who you want to talk to."
            };
        }

        // Find the NPC in the scene
        const npc = context.npcs?.find(n => n.id === intent.targetId);
        if (!npc) {
            return {
                outcome: 'failure',
                narrativeResolver: `You don't see ${intent.targetId} here.`
            };
        }

        // Get player character
        const player = state.characters.player
        if (!player) {
            return {
                outcome: 'failure',
                narrativeResolver: "Player character not found."
            };
        }

        // Get player's current perception
        const objectsMap: Record<string, GameObject> = {};
        for (const entry of player.inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
            }
        }

        if (!statCalculator) {
            return {
                outcome: 'failure',
                narrativeResolver: "Stat calculator not available."
            };
        }

        const playerPerception = statCalculator.getEffectiveStat(player, 'perception', objectsMap);

        // Filter key information based on player's perception
        const availableKeyInformation = npc.keyInformation 
            ? npc.keyInformation.filter(info => info.perception <= playerPerception)
            : [];

        // Extract message from original input or use a default
        let playerMessage = intent.originalInput || "Hello";
        
        // If the original input contains the NPC name/ID, try to extract just the message part
        if (intent.originalInput) {
            const lowerInput = intent.originalInput.toLowerCase();
            const npcNameLower = npc.name.toLowerCase();
            const npcIdLower = npc.id.toLowerCase();
            
            const nameIndex = lowerInput.indexOf(npcNameLower);
            const idIndex = lowerInput.indexOf(npcIdLower);
            const targetIndex = Math.max(nameIndex, idIndex);
            
            if (targetIndex !== -1) {
                const afterTarget = intent.originalInput.substring(
                    targetIndex + (nameIndex > idIndex ? npc.name.length : npc.id.length)
                ).trim();
                
                // Remove common connecting words
                const messageStarters = ['about', 'regarding', 'concerning', 'that', 'how', 'what', 'why', 'when', 'where'];
                for (const starter of messageStarters) {
                    if (afterTarget.toLowerCase().startsWith(starter + ' ')) {
                        playerMessage = afterTarget.substring(starter.length).trim();
                        break;
                    }
                }
                if (playerMessage === intent.originalInput && afterTarget.length > 0) {
                    playerMessage = afterTarget;
                }
            }
        }

        // Generate NPC response
        let npcResponse: string;
        try {
            npcResponse = await generateNPCResponse(
                playerMessage,
                npc,
                availableKeyInformation,
                state,
                context,
                statCalculator,
                effectManager
            );
        } catch (error) {
            logger.error('[TalkCommand] Failed to generate NPC response:', error);
            npcResponse = `${npc.name} seems unable to respond right now.`;
        }

        // Build narrative
        const narrative = `${npc.name}: "${npcResponse}"`;

        // Note: Conversation context entry will be handled by the engine's processTurn method
        // when it detects intent.type === 'talk'
        // Conversation history will also be updated by processTurn

        return {
            outcome: 'success',
            narrativeResolver: narrative,
            effects: {}
        };
    }

    /**
     * Match a target string against NPCs in the context.
     * Returns the matched NPC or null if no match found.
     */
    private matchNPC(target: string, context: SceneContext): NPCDefinition | null {
        if (!context.npcs) {
            return null;
        }

        const lowerTarget = target.toLowerCase();

        for (const npc of context.npcs) {
            if (npc.id.toLowerCase() === lowerTarget ||
                npc.name.toLowerCase() === lowerTarget ||
                npc.name.toLowerCase().includes(lowerTarget) ||
                npc.id.toLowerCase().includes(lowerTarget)) {
                return npc;
            }
        }

        return null;
    }
}

