import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, ResolutionResult, ActionEffects, GameState } from '../types';
import type { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { StatCalculator } from '../stats';
import { EffectManager } from '../effects';
import { ParsedCommand } from '../utils/nlp-parser';
import { GameObject } from '../game-object';
import { findItemInInventory } from '../container';

export class SetStateCommand implements Command {
    getCommandId(): string {
        return 'set-state';
    }

    matchesIntent(intent: ActionIntent): boolean {
        return intent.type === this.getCommandId();
    }

    getAliases(): { singleWords: string[]; phrasalVerbs: string[] } {
        // Dynamic aliases will be generated from object state definitions
        // For now, return empty arrays - the command will be matched via action names
        return {
            singleWords: [],
            phrasalVerbs: []
        };
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({
            objectId: z.string().describe('ID of the object to change state'),
            stateId: z.string().describe('ID of the state to set')
        });
    }

    processProcedural(parsed: ParsedCommand, input: string, context: SceneContext): NormalizedCommandInput | null {
        // Try to match the verb phrase to an action name from object states
        let verbPhrase = parsed.verbPhrase?.toLowerCase() || parsed.verb?.toLowerCase() || '';
        let target = parsed.target?.toLowerCase() || '';

        // If no verb phrase was extracted, try to extract it from the input
        // This handles cases where "turn on" isn't registered as a phrasal verb
        if (!verbPhrase) {
            const lowerInput = input.toLowerCase().trim();
            // Try common patterns: "verb target" or "verb preposition target"
            // For "turn on lantern", we want verbPhrase="turn on", target="lantern"
            const words = lowerInput.split(/\s+/);
            if (words.length >= 2) {
                // Check if first two words might be a phrasal verb
                const potentialPhrasal = words.slice(0, 2).join(' ');
                // Check if any object has this as an action name
                if (context.objects) {
                    for (const obj of context.objects) {
                        if (obj.states) {
                            for (const state of obj.states) {
                                if (state.actionNames?.some(name => name.toLowerCase() === potentialPhrasal)) {
                                    verbPhrase = potentialPhrasal;
                                    target = words.slice(2).join(' ');
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Search for objects with matching action names
        const match = this.findObjectWithActionName(verbPhrase, target, context, input.toLowerCase());
        if (match) {
            return {
                commandId: 'set-state',
                parameters: {
                    objectId: match.objectId,
                    stateId: match.stateId
                }
            };
        }

        return null;
    }

    async extractParameters(userInput: string, context: SceneContext): Promise<NormalizedCommandInput | null> {
        // Parse the input to extract verb phrase and target
        const { parseCommand } = await import('../utils/nlp-parser');
        const parsed = parseCommand(userInput);
        const verbPhrase = parsed.verbPhrase?.toLowerCase() || parsed.verb?.toLowerCase() || '';
        const target = parsed.target?.toLowerCase() || '';
        
        // If we have a verb phrase, use it; otherwise use the full input
        const searchPhrase = verbPhrase || userInput.toLowerCase();
        
        // Search for objects with matching action names
        const match = this.findObjectWithActionName(searchPhrase, target, context, userInput.toLowerCase());
        if (match) {
            return {
                commandId: 'set-state',
                parameters: {
                    objectId: match.objectId,
                    stateId: match.stateId
                }
            };
        }

        return null;
    }

    /**
     * Find an object that has a state with a matching action name.
     * Searches both scene objects and inventory.
     */
    private findObjectWithActionName(
        verbPhrase: string,
        target: string,
        context: SceneContext,
        fullInput?: string
    ): { objectId: string; stateId: string } | null {
        // Search scene objects
        if (context.objects) {
            for (const obj of context.objects) {
                // First try with verbPhrase and target
                let match = this.matchActionNameInObject(obj, verbPhrase, target);
                if (match) {
                    return { objectId: obj.id, stateId: match };
                }
                
                // If no match and we have full input, try searching the full input
                // This handles cases where the NLP parser didn't extract verbPhrase correctly
                if (!match && fullInput) {
                    const lowerInput = fullInput.toLowerCase();
                    // Try to find action names in the full input
                    if (obj.states) {
                        for (const state of obj.states) {
                            if (state.actionNames) {
                                for (const actionName of state.actionNames) {
                                    const actionLower = actionName.toLowerCase();
                                    // Check if the full input contains the action name
                                    if (lowerInput.includes(actionLower)) {
                                        // Extract what might be the target (everything after the action name)
                                        const actionIndex = lowerInput.indexOf(actionLower);
                                        const afterAction = lowerInput.substring(actionIndex + actionLower.length).trim();
                                        // Check if object is mentioned in the input
                                        const objIdLower = obj.id.toLowerCase();
                                        const objDescLower = obj.description.toLowerCase();
                                        const objMentioned = lowerInput.includes(objIdLower) || 
                                                           objDescLower.split(/\s+/).some(word => 
                                                               word.length > 2 && lowerInput.includes(word.toLowerCase())
                                                           );
                                        if (objMentioned || !afterAction) {
                                            return { objectId: obj.id, stateId: state.id };
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Search inventory (we need to get character from context somehow)
        // For now, we'll search scene objects only - inventory search would require GameState
        // This will be handled in the resolve method

        return null;
    }

    /**
     * Check if an object has a state with a matching action name.
     */
    private matchActionNameInObject(
        obj: GameObject,
        verbPhrase: string,
        target: string
    ): string | null {
        const states = obj.states;
        if (!states) {
            return null;
        }

        // Check if target matches object ID or description
        const objIdLower = obj.id.toLowerCase();
        const objDescLower = obj.description.toLowerCase();
        const targetLower = target.toLowerCase();
        
        // Extract key words from object description (remove common words)
        const descWords = objDescLower.split(/\s+/).filter(word => 
            word.length > 2 && 
            !['the', 'a', 'an', 'from', 'with', 'and', 'or', 'in', 'on', 'at', 'to', 'for'].includes(word)
        );
        const objKeyWords = [objIdLower, ...descWords];
        
        const matchesObject = !target || 
            objIdLower.includes(targetLower) || 
            objDescLower.includes(targetLower) ||
            objKeyWords.some(word => word.includes(targetLower) || targetLower.includes(word));

        // Check each state for matching action names
        // First, try exact matches (highest priority)
        for (const state of states) {
            if (state.actionNames) {
                for (const actionName of state.actionNames) {
                    const actionLower = actionName.toLowerCase();
                    // Exact match has highest priority
                    if (verbPhrase === actionLower || actionLower === verbPhrase) {
                        // If we have a target, it must match the object
                        if (target && !matchesObject) {
                            continue; // Try next action name
                        }
                        return state.id;
                    }
                }
            }
        }
        
        // Then try substring matches (lower priority)
        for (const state of states) {
            if (state.actionNames) {
                for (const actionName of state.actionNames) {
                    const actionLower = actionName.toLowerCase();
                    // Check if verb phrase contains the action name or vice versa
                    // But be more strict - the longer phrase should contain the shorter one
                    const longer = verbPhrase.length > actionLower.length ? verbPhrase : actionLower;
                    const shorter = verbPhrase.length > actionLower.length ? actionLower : verbPhrase;
                    const actionMatches = longer.includes(shorter) && shorter.length >= 3; // At least 3 chars to avoid false matches
                    
                    if (actionMatches) {
                        // If we have a target, it must match the object
                        if (target && !matchesObject) {
                            continue; // Try next action name
                        }
                        return state.id;
                    }
                }
            }
        }

        return null;
    }

    execute(input: NormalizedCommandInput, context: SceneContext, originalInput?: string): ActionIntent {
        const objectId = input.parameters.objectId;
        const stateId = input.parameters.stateId;

        if (!objectId || !stateId) {
            throw new Error('SetState command requires objectId and stateId parameters');
        }

        // Verify object exists in scene or inventory
        const objectInScene = context.objects?.find(obj => obj.id === objectId);
        if (!objectInScene) {
            // Object might be in inventory - we'll check in resolve
            logger.log(`[SetStateCommand] Object "${objectId}" not found in scene, will check inventory in resolve`);
        }

        return {
            actorId: 'player',
            type: 'set-state',
            targetId: objectId,
            itemId: stateId, // Reuse itemId field to store stateId
            sceneId: context.id,
            originalInput: originalInput
        };
    }

    async resolve(
        state: GameState,
        intent: ActionIntent,
        _context: SceneContext,
        _statCalculator?: StatCalculator,
        _effectManager?: EffectManager
    ): Promise<ResolutionResult> {
        const objectId = intent.targetId;
        const stateId = intent.itemId; // Reuse itemId to store stateId

        if (!objectId || !stateId) {
            return {
                outcome: 'failure',
                narrativeResolver: 'I need to know which object and what state to set.'
            };
        }

        // Find the object in scene or inventory
        let object: GameObject | null = null;

        // Check scene objects
        const sceneObjects = state.sceneObjects[state.currentSceneId] || [];
        object = sceneObjects.find(obj => obj.id === objectId) || null;

        // Check inventory if not found in scene
        if (!object) {
            const character = state.characters['player'];
            if (character) {
                const itemResult = findItemInInventory(character.inventory, objectId);
                if (itemResult && itemResult.item) {
                    object = itemResult.item;
                }
            }
        }

        if (!object) {
            return {
                outcome: 'failure',
                narrativeResolver: `I can't find "${objectId}" here.`
            };
        }

        // Verify object has states
        if (!object.states || object.states.length === 0) {
            return {
                outcome: 'failure',
                narrativeResolver: `The ${object.description} doesn't have any states to change.`
            };
        }

        // Verify state exists
        const stateDef = object.states.find(s => s.id === stateId);
        if (!stateDef) {
            return {
                outcome: 'failure',
                narrativeResolver: `The ${object.description} doesn't have a "${stateId}" state.`
            };
        }

        // Get current state
        const currentStateId = state.getObjectState(objectId);

        // Check if already in this state
        if (currentStateId === stateId) {
            return {
                outcome: 'success',
                narrativeResolver: `The ${object.description} is already ${stateId}.`
            };
        }

        // Prepare effects for state transition
        const effects: ActionEffects = {};

        // Remove effects from previous state
        if (currentStateId) {
            const previousState = object.states.find(s => s.id === currentStateId);
            if (previousState?.effects) {
                // Invert the effects to remove them
                if (previousState.effects.addEffects) {
                    effects.removeEffects = previousState.effects.addEffects;
                }
                if (previousState.effects.addTraits) {
                    effects.removeTraits = previousState.effects.addTraits;
                }
                if (previousState.effects.addFlags) {
                    effects.removeFlags = previousState.effects.addFlags;
                }
                if (previousState.effects.stats) {
                    // Invert stat changes
                    const invertedStats: Partial<Record<keyof import('../types').StatBlock, number>> = {};
                    for (const [key, value] of Object.entries(previousState.effects.stats)) {
                        invertedStats[key as keyof import('../types').StatBlock] = -(value || 0);
                    }
                    effects.stats = invertedStats;
                }
            }
        }

        // Add effects from new state
        if (stateDef.effects) {
            // Copy target if present
            if (stateDef.effects.target) {
                effects.target = { ...stateDef.effects.target };
            }
            if (stateDef.effects.addEffects) {
                effects.addEffects = stateDef.effects.addEffects;
            }
            if (stateDef.effects.addTraits) {
                effects.addTraits = stateDef.effects.addTraits;
            }
            if (stateDef.effects.addFlags) {
                effects.addFlags = stateDef.effects.addFlags;
            }
            if (stateDef.effects.stats) {
                // Merge with existing stat changes
                if (effects.stats) {
                    for (const [key, value] of Object.entries(stateDef.effects.stats)) {
                        const existing = effects.stats[key as keyof import('../types').StatBlock] || 0;
                        effects.stats[key as keyof import('../types').StatBlock] = existing + (value || 0);
                    }
                } else {
                    effects.stats = { ...stateDef.effects.stats };
                }
            }
        }

        // Store state change in a custom field that will be handled by StateEffect
        (effects as any).setObjectState = { objectId, stateId };

        // Generate narrative
        const stateName = stateDef.actionNames?.[0] || stateId;
        // Handle descriptions that start with "A" or "An" - don't add "the" before them
        let objectDesc = object.description;
        if (objectDesc.match(/^(A|An)\s+/i)) {
            // Description already has article, use as-is
            objectDesc = objectDesc.replace(/^(A|An)\s+/i, '');
        }
        const narrative = `You ${stateName} ${objectDesc}.`;

        return {
            outcome: 'success',
            narrativeResolver: narrative,
            effects: effects
        };
    }
}

