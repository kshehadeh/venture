import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult } from '../types';
import { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { EffectManager } from '../effects';

export class EffectsCommand implements Command {
    getCommandId(): string {
        return 'effects';
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({}); // No parameters
    }

    execute(input: NormalizedCommandInput, context: SceneContext): ActionIntent {
        logger.log('[EffectsCommand] Executing with input:', JSON.stringify(input, null, 2));
        const intent = {
            actorId: 'player',
            type: 'choice' as const,
            choiceId: 'effects',
            sceneId: context.id
        };
        logger.log('[EffectsCommand] ActionIntent created:', JSON.stringify(intent, null, 2));
        return intent;
    }

    resolve(state: GameState, intent: ActionIntent, context: SceneContext): ResolutionResult {
        const character = state.characters[intent.actorId || 'player'];
        if (!character) {
            return {
                outcome: 'failure',
                narrativeResolver: "Character not found.",
                effects: undefined
            };
        }

        // Create EffectManager to get effect definitions
        const effectManager = new EffectManager(state.effectDefinitions);

        if (character.effects.length === 0) {
            return {
                outcome: 'success',
                narrativeResolver: "You have no active effects.",
                effects: undefined,
                nextSceneId: undefined
            };
        }

        let narrative = "Active Effects:\n";
        
        for (const effectData of character.effects) {
            const definition = effectManager.getEffectDefinition(effectData.id);
            const name = definition?.name || effectData.id;
            const description = definition?.description || "An unknown effect.";
            
            // Duration info
            let durationText = "";
            if (effectData.duration === undefined) {
                durationText = " (Permanent)";
            } else {
                durationText = ` (${effectData.duration} turn${effectData.duration !== 1 ? 's' : ''} remaining)`;
            }

            narrative += `\n  - ${name}: ${description}${durationText}`;

            // Stat modifiers
            if (effectData.statModifiers) {
                const modifierTexts: string[] = [];
                for (const [key, value] of Object.entries(effectData.statModifiers)) {
                    if (value !== 0) {
                        const sign = value > 0 ? '+' : '';
                        modifierTexts.push(`${key}: ${sign}${value}`);
                    }
                }
                if (modifierTexts.length > 0) {
                    narrative += `\n    Effects: ${modifierTexts.join(', ')}`;
                }
            }

            // Per-turn modifiers
            if (effectData.perTurnModifiers) {
                const perTurnTexts: string[] = [];
                for (const [key, value] of Object.entries(effectData.perTurnModifiers)) {
                    if (value !== 0) {
                        const sign = value > 0 ? '+' : '';
                        perTurnTexts.push(`${key}: ${sign}${value} per turn`);
                    }
                }
                if (perTurnTexts.length > 0) {
                    narrative += `\n    Effects: ${perTurnTexts.join(', ')}`;
                }
            }
        }

        logger.log('[EffectsCommand] Generated narrative:', narrative);

        return {
            outcome: 'success',
            narrativeResolver: narrative,
            effects: undefined,
            nextSceneId: undefined
        };
    }
}

