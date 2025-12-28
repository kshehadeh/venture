import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult, ActionEffects, CharacterState } from '../types';
import { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { StatCalculator } from '../stats';

export class LookCommand implements Command {
    getCommandId(): string {
        return 'look';
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({
            target: z.string().optional().describe('Optional noun to look at')
        });
    }

    execute(input: NormalizedCommandInput, context: SceneContext): ActionIntent {
        logger.log('[LookCommand] Executing with input:', JSON.stringify(input, null, 2));
        const intent = {
            actorId: 'player',
            type: 'choice' as const,
            choiceId: 'look',
            sceneId: context.id
        };
        logger.log('[LookCommand] ActionIntent created:', JSON.stringify(intent, null, 2));
        return intent;
    }

    resolve(state: GameState, intent: ActionIntent, context: SceneContext, statCalculator?: StatCalculator): ResolutionResult {
        // Look command - show scene narrative, visible objects, visible NPCs, and visible exits
        let lookText = context.narrative || "You look around.";
        
        // Get player character and their perception
        const player = state.characters[intent.actorId || 'player'];
        if (!player) {
            return {
                outcome: 'failure',
                narrativeResolver: "Character not found.",
                effects: undefined
            };
        }

        // Calculate player's current perception
        const calc = statCalculator || new StatCalculator();
        const objectsMap: Record<string, import('../types').ObjectDefinition> = {};
        for (const entry of player.inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
            }
        }
        const playerPerception = calc.getEffectiveStat(player, 'perception', objectsMap);
        
        // List visible objects
        if (context.objects && context.objects.length > 0) {
            lookText += "\n\nYou notice:";
            for (const obj of context.objects) {
                lookText += `\n  - ${obj.description}`;
            }
        }
        
        // List visible NPCs
        // NPCs are defined in the scene context - this is the source of truth
        // We only check state.characters for dynamic state (inventory, effects, etc.) if the NPC has been modified
        if (context.npcs && context.npcs.length > 0) {
            const visibleNPCs: Array<{ npc: typeof context.npcs[number]; character?: CharacterState }> = [];
            
            for (const npcDef of context.npcs) {
                logger.log('[LookCommand] Checking NPC:', JSON.stringify(npcDef, null, 2));
                // NPCs are defined in scenes - use the scene definition as primary source
                // Only check game state if NPC has dynamic state to track (inventory changes, effects, etc.)
                const npcCharacter = state.characters[npcDef.id];
                
                let npcAgility: number;
                let isHidden: boolean;
                
                if (npcCharacter) {
                    // NPC has dynamic state - use current calculated stats from character state
                    const npcObjectsMap: Record<string, import('../types').ObjectDefinition> = {};
                    for (const entry of npcCharacter.inventory) {
                        if (entry.objectData) {
                            npcObjectsMap[entry.id] = entry.objectData;
                        }
                    }
                    npcAgility = calc.getEffectiveStat(npcCharacter, 'agility', npcObjectsMap);
                    
                    // Check if NPC has "hidden" trait (from dynamic state)
                    isHidden = npcCharacter.traits.has('hidden');
                } else {
                    // NPC not in game state - use base stats from scene definition
                    npcAgility = npcDef.baseStats.agility || 0;
                    // Check if NPC has "hidden" trait in scene definition
                    isHidden = (npcDef.traits || []).includes('hidden');
                }
                
                // NPC is visible if: player perception >= NPC agility AND NPC is not hidden
                if (!isHidden || (isHidden && (playerPerception >= npcAgility))) {
                    visibleNPCs.push({ npc: npcDef, character: npcCharacter });
                }
            }
            
            if (visibleNPCs.length > 0) {
                lookText += "\n\nYou see:";
                for (const { npc, character } of visibleNPCs) {
                    const description = npc.description || `${npc.name} is here.`;
                    lookText += `\n  - ${description}`;
                }
            }
        }
        
        // List visible exits
        if (context.exits && context.exits.length > 0) {
            lookText += "\n\nExits:";
            for (const exit of context.exits) {
                const exitName = exit.name || exit.description || exit.direction.toUpperCase();
                const exitType = exit.type ? ` (${exit.type})` : '';
                lookText += `\n  - ${exitName}${exitType} [${exit.direction.toUpperCase()}]`;
            }
        }
        
        const effects: ActionEffects = {};

        // Apply viewEffects for objects when looking
        if (context.objects) {
            const viewEffectsList: ActionEffects[] = [];
            for (const obj of context.objects) {
                if (obj.viewEffects) {
                    viewEffectsList.push(obj.viewEffects);
                }
            }
            // Merge all view effects
            if (viewEffectsList.length > 0) {
                effects.stats = {};
                effects.addTraits = [];
                effects.addFlags = [];
                for (const ve of viewEffectsList) {
                    if (ve.addTraits) {
                        effects.addTraits.push(...ve.addTraits);
                    }
                    if (ve.addFlags) {
                        effects.addFlags.push(...ve.addFlags);
                    }
                    if (ve.stats) {
                        for (const [key, value] of Object.entries(ve.stats)) {
                            effects.stats![key as keyof typeof effects.stats] = (effects.stats[key as keyof typeof effects.stats] || 0) + value;
                        }
                    }
                }
            }
        }

        return {
            outcome: 'success',
            narrativeResolver: lookText,
            effects: Object.keys(effects).length > 0 ? effects : undefined,
            nextSceneId: undefined
        };
    }
}

