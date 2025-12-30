import { z } from 'zod';
import { Command } from './base-command';
import { ActionIntent, GameState, ResolutionResult, ActionEffects, CharacterState, DetailedDescription } from '../types';
import type { SceneContext } from '../engine';
import { getVisibleObjects } from '../engine';
import { NormalizedCommandInput } from '../command';
import { logger } from '../logger';
import { StatCalculator } from '../stats';
import { EffectManager } from '../effects';
import { answerQuestionAboutTarget, identifyTarget } from '../llm';
import { ParsedCommand } from '../utils/nlp-parser';
import { GameObject } from '../game-object';

export class LookCommand implements Command {
    getCommandId(): string {
        return 'look';
    }

    matchesIntent(intent: ActionIntent): boolean {
        return intent.type === this.getCommandId();
    }

    getAliases(): { singleWords: string[]; phrasalVerbs: string[] } {
        return {
            singleWords: ['look', 'examine', 'inspect', 'view', 'check', 'see', 'search', 'l'],
            phrasalVerbs: ['look at']
        };
    }

    getParameterSchema(): z.ZodSchema {
        return z.object({
            target: z.string().optional().describe('Optional noun to look at')
        });
    }

    processProcedural(parsed: ParsedCommand, _input: string, _context: SceneContext): NormalizedCommandInput | null {
        // Check if it's "look at" without a target - should return null
        if (parsed.verbPhrase === 'look at' && !parsed.target) {
            logger.log('[LookCommand] "look at" without target, returning null');
            return null;
        }
        
        if (!parsed.target) {
            logger.log('[LookCommand] Look command without target');
            return {
                commandId: 'look',
                parameters: {}
            };
        }

        // For look commands, preserve the original target case
        // The command will handle the actual matching
        logger.log(`[LookCommand] Look command with target: "${parsed.target}"`);
        return {
            commandId: 'look',
            parameters: {
                target: parsed.target
            }
        };
    }

    async extractParameters(userInput: string, context: SceneContext): Promise<NormalizedCommandInput | null> {
        logger.log('[LookCommand] Extracting parameters from input:', userInput);
        
        // Try to identify a target
        const target = await identifyTarget(userInput, context, 'look');
        
        const parameters: Record<string, any> = {};
        if (target) {
            // Try to match the target to an actual entity in the scene
            const matchedId = this.matchTarget(target, context);
            if (matchedId) {
                parameters.target = matchedId;
                logger.log(`[LookCommand] Matched target "${target}" to ID: ${matchedId}`);
            } else {
                // Couldn't match, but return the target anyway - execute() will handle it
                parameters.target = target;
                logger.log(`[LookCommand] Could not match target "${target}", will pass through to execute()`);
            }
        }
        
        return {
            commandId: 'look',
            parameters: parameters
        };
    }

    execute(input: NormalizedCommandInput, context: SceneContext, originalInput?: string): ActionIntent {
        logger.log('[LookCommand] Executing with input:', JSON.stringify(input, null, 2));
        const intent: ActionIntent = {
            actorId: 'player',
            type: 'look' as const,
            sceneId: context.id,
            originalInput: originalInput
        };

        // If target is provided, try to match it to an object, NPC, exit, or scene
        const target = input.parameters.target;
        if (target) {
            logger.log(`[LookCommand] Target provided: "${target}", attempting to match...`);
            const matchedId = this.matchTarget(target, context);
            if (matchedId) {
                intent.targetId = matchedId;
                logger.log(`[LookCommand] Matched target to ID: ${matchedId}`);
            } else {
                // Target provided but doesn't match - set it anyway so resolveTargetedLook can return proper error
                intent.targetId = target;
                logger.log(`[LookCommand] Could not match target "${target}", will return error in resolve`);
            }
        }

        logger.log('[LookCommand] ActionIntent created:', JSON.stringify(intent, null, 2));
        return intent;
    }

    /**
     * Match a target string against objects, NPCs, exits, or scene in the context.
     * Returns the matched entity ID or null if no match found.
     */
    private matchTarget(target: string, context: SceneContext): string | null {
        const lowerTarget = target.toLowerCase();

        // Match against objects
        if (context.objects) {
            for (const obj of context.objects) {
                if (obj.id.toLowerCase() === lowerTarget ||
                    obj.description.toLowerCase().includes(lowerTarget)) {
                    return obj.id;
                }
            }
        }

        // Match against NPCs
        if (context.npcs) {
            for (const npc of context.npcs) {
                if (npc.id.toLowerCase() === lowerTarget ||
                    npc.name.toLowerCase().includes(lowerTarget)) {
                    return npc.id;
                }
            }
        }

        // Match against exits
        if (context.exits) {
            for (const exit of context.exits) {
                if (exit.direction.toLowerCase() === lowerTarget ||
                    exit.name?.toLowerCase().includes(lowerTarget) ||
                    exit.description?.toLowerCase().includes(lowerTarget)) {
                    return exit.direction; // Use direction as ID for exits
                }
            }
        }

        // Match against scene
        if (context.id.toLowerCase() === lowerTarget || lowerTarget === 'scene') {
            return context.id;
        }

        return null;
    }

    /**
     * Merge multiple ActionEffects into a single ActionEffects object.
     */
    private mergeEffects(effectsList: ActionEffects[]): ActionEffects {
        const merged: ActionEffects = {
            stats: {} as Partial<Record<keyof import('../types').StatBlock, number>>,
            addTraits: [],
            removeTraits: [],
            addFlags: [],
            removeFlags: [],
            addItems: [],
            removeItems: [],
            addEffects: [],
            removeEffects: []
        };

        for (const effects of effectsList) {
            if (effects.stats) {
                for (const [key, value] of Object.entries(effects.stats)) {
                    const statKey = key as keyof import('../types').StatBlock;
                    merged.stats![statKey] = ((merged.stats![statKey] || 0) + value) as number;
                }
            }
            if (effects.addTraits) {
                merged.addTraits!.push(...effects.addTraits);
            }
            if (effects.removeTraits) {
                merged.removeTraits!.push(...effects.removeTraits);
            }
            if (effects.addFlags) {
                merged.addFlags!.push(...effects.addFlags);
            }
            if (effects.removeFlags) {
                merged.removeFlags!.push(...effects.removeFlags);
            }
            if (effects.addItems) {
                merged.addItems!.push(...effects.addItems);
            }
            if (effects.removeItems) {
                merged.removeItems!.push(...effects.removeItems);
            }
            if (effects.addEffects) {
                merged.addEffects!.push(...effects.addEffects);
            }
            if (effects.removeEffects) {
                merged.removeEffects!.push(...effects.removeEffects);
            }
        }

        // Clean up empty arrays
        if (merged.addTraits!.length === 0) delete merged.addTraits;
        if (merged.removeTraits!.length === 0) delete merged.removeTraits;
        if (merged.addFlags!.length === 0) delete merged.addFlags;
        if (merged.removeFlags!.length === 0) delete merged.removeFlags;
        if (merged.addItems!.length === 0) delete merged.addItems;
        if (merged.removeItems!.length === 0) delete merged.removeItems;
        if (merged.addEffects!.length === 0) delete merged.addEffects;
        if (merged.removeEffects!.length === 0) delete merged.removeEffects;
        if (Object.keys(merged.stats!).length === 0) delete merged.stats;

        return merged;
    }

    /**
     * Filter detailed descriptions by perception and return visible ones.
     */
    private getVisibleDetailedDescriptions(
        detailedDescriptions: DetailedDescription[] | undefined,
        playerPerception: number
    ): DetailedDescription[] {
        if (!detailedDescriptions) return [];
        return detailedDescriptions.filter(dd => dd.perception <= playerPerception);
    }

    /**
     * Extract the target from the original input string.
     * Tries to find the target after "look at", "examine", "inspect", etc.
     */
    private extractTargetFromInput(originalInput: string): string {       
        // Try to extract target after common look command verbs
        const patterns = [
            /^(?:look\s+at|examine|inspect|view|check|see)\s+(.+)$/i,
            /^(.+)$/ // Fallback: use the whole input if no pattern matches
        ];
        
        for (const pattern of patterns) {
            const match = originalInput.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        
        return originalInput.trim();
    }

    async resolve(state: GameState, intent: ActionIntent, context: SceneContext, statCalculator?: StatCalculator, _effectManager?: EffectManager): Promise<ResolutionResult> {
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
        const objectsMap: Record<string, GameObject> = {};
        for (const entry of player.inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
            }
        }
        const playerPerception = calc.getEffectiveStat(player, 'perception', objectsMap);

        // Check if this is a targeted look
        if (intent.targetId) {
            return await this.resolveTargetedLook(state, intent, context, playerPerception, calc, objectsMap);
        }

        // General look - show scene overview
        return this.resolveGeneralLook(state, intent, context, playerPerception, calc, objectsMap);
    }

    /**
     * Check if the original input appears to be a conversational question.
     */
    private isConversationalQuestion(originalInput?: string): boolean {
        if (!originalInput) return false;
        
        const lowerInput = originalInput.toLowerCase().trim();
        
        // Check for question words
        const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'whose'];
        const hasQuestionWord = questionWords.some(word => 
            lowerInput.startsWith(word) || lowerInput.includes(` ${word} `) || lowerInput.includes(` ${word}?`)
        );
        
        // Check for question mark
        const hasQuestionMark = lowerInput.includes('?');
        
        // Check if it's not just a simple "look at X" command
        const isSimpleLook = /^(look\s+at|examine|inspect)\s+\w+$/i.test(lowerInput);
        
        return (hasQuestionWord || hasQuestionMark) && !isSimpleLook;
    }

    /**
     * Resolve a targeted look at a specific object, NPC, exit, or scene.
     */
    private async resolveTargetedLook(
        state: GameState,
        intent: ActionIntent,
        context: SceneContext,
        playerPerception: number,
        _calc: StatCalculator,
        _objectsMap: Record<string, GameObject>
    ): Promise<ResolutionResult> {
        const targetId = intent.targetId!;
        const lowerTargetId = targetId.toLowerCase();
        let lookText = '';
        const effectsList: ActionEffects[] = [];

        // Check if this is a conversational question that needs AI fallback
        const isQuestion = this.isConversationalQuestion(intent.originalInput);

        // Get scene objects from state (the source of truth, includes dropped objects)
        const sceneObjects = state.sceneObjects[state.currentSceneId] || [];

        // Try to match as an inventory item (container)
        const player = state.characters[intent.actorId || 'player'];
        if (player) {
            for (const entry of player.inventory) {
                // Match by ID or description (case-insensitive)
                if (entry.objectData && (
                    entry.id.toLowerCase() === lowerTargetId ||
                    entry.objectData.description.toLowerCase().includes(lowerTargetId)
                )) {
                    const container = entry.objectData;
                    let lookText = container.description;
                    
                    // Display general storage contents
                    if (container.contains && container.contains.length > 0) {
                        lookText += '\n\nIt contains:';
                        for (const item of container.contains) {
                            const quantity = item.quantity && item.quantity > 1 ? ` (x${item.quantity})` : '';
                            lookText += `\n  - ${item.id}${quantity}`;
                        }
                    }
                    
                    // Display slot contents
                    if (container.slots && container.slots.length > 0) {
                        const occupiedSlots = container.slots.filter(slot => slot.itemId);
                        if (occupiedSlots.length > 0) {
                            lookText += '\n\nSlots:';
                            for (const slot of occupiedSlots) {
                                const slotName = slot.name || slot.id;
                                lookText += `\n  - ${slotName}: ${slot.itemId}`;
                            }
                        }
                    }
                    
                    // Add detailed descriptions
                    const visibleDetails = container.getVisibleDetailedDescriptions(playerPerception);
                    if (visibleDetails.length > 0) {
                        for (const detail of visibleDetails) {
                            lookText += '\n\n' + detail.text;
                            if (detail.effects) {
                                effectsList.push(detail.effects);
                            }
                        }
                    }
                    
                    // Add viewEffects if present
                    if (container.viewEffects) {
                        effectsList.push(container.viewEffects);
                    }
                    
                    const mergedEffects = this.mergeEffects(effectsList);
                    return {
                        outcome: 'success',
                        narrativeResolver: lookText,
                        effects: Object.keys(mergedEffects).length > 0 ? mergedEffects : undefined,
                        nextSceneId: undefined
                    };
                }
            }
        }

        // Try to match as an object
        // Use state.sceneObjects as the source of truth (includes dropped objects)
        // Match by ID or description (case-insensitive)
        const obj = sceneObjects.find(o => 
            o.id.toLowerCase() === lowerTargetId ||
            o.description.toLowerCase().includes(lowerTargetId)
        );
        if (obj) {
                // If it's a question, use AI to answer it
                if (isQuestion && intent.originalInput) {
                    const visibleDetails = obj.getVisibleDetailedDescriptions(playerPerception);
                    
                    // Collect all other objects with their detailed descriptions (including dropped objects)
                    const otherObjects = sceneObjects
                        .filter(o => o.id !== obj.id)
                        .map(o => ({
                            object: o,
                            detailedDescriptions: o.getVisibleDetailedDescriptions(playerPerception)
                        }));
                    
                    // Collect all NPCs with their detailed descriptions
                    const npcs = (context.npcs || []).map(npc => ({
                        npc: npc,
                        detailedDescriptions: this.getVisibleDetailedDescriptions(npc.detailedDescriptions, playerPerception)
                    }));
                    
                    // Collect all exits with their detailed descriptions
                    const exits = (context.exits || []).map(exit => ({
                        exit: exit,
                        detailedDescriptions: this.getVisibleDetailedDescriptions(exit.detailedDescriptions, playerPerception)
                    }));
                    
                    const aiAnswer = await answerQuestionAboutTarget(
                        intent.originalInput,
                        obj.description,
                        visibleDetails,
                        {
                            sceneNarrative: context.narrative,
                            sceneDetailedDescriptions: this.getVisibleDetailedDescriptions(context.detailedDescriptions, playerPerception),
                            otherObjects: otherObjects,
                            npcs: npcs,
                            exits: exits
                        }
                    );
                    
                    // Still apply viewEffects even for AI answers
                    if (obj.viewEffects) {
                        effectsList.push(obj.viewEffects);
                    }
                    
                    const mergedEffects = this.mergeEffects(effectsList);
                    return {
                        outcome: 'success',
                        narrativeResolver: aiAnswer,
                        effects: Object.keys(mergedEffects).length > 0 ? mergedEffects : undefined,
                        nextSceneId: undefined
                    };
                }
                
                // Procedural handling for non-questions
                lookText = obj.description;
                
                // Add object's viewEffects if present
                if (obj.viewEffects) {
                    effectsList.push(obj.viewEffects);
                }

                // Add detailed descriptions
                const visibleDetails = this.getVisibleDetailedDescriptions(obj.detailedDescriptions, playerPerception);
                if (visibleDetails.length > 0) {
                    for (const detail of visibleDetails) {
                        lookText += '\n\n' + detail.text;
                        if (detail.effects) {
                            effectsList.push(detail.effects);
                        }
                    }
                }

                const mergedEffects = this.mergeEffects(effectsList);
                return {
                    outcome: 'success',
                    narrativeResolver: lookText,
                    effects: Object.keys(mergedEffects).length > 0 ? mergedEffects : undefined,
                    nextSceneId: undefined
                };
        }

        // Try to match as an NPC
        if (context.npcs) {
            // Match by ID or name (case-insensitive)
            const npc = context.npcs.find(n => 
                n.id.toLowerCase() === lowerTargetId ||
                n.name.toLowerCase().includes(lowerTargetId)
            );
            if (npc) {
                // If it's a question, use AI to answer it
                if (isQuestion && intent.originalInput) {
                    const visibleDetails = this.getVisibleDetailedDescriptions(npc.detailedDescriptions, playerPerception);
                    const npcDescription = npc.description || `${npc.name} is here.`;
                    
                    // Collect all objects with their detailed descriptions (including dropped objects)
                    const otherObjects = sceneObjects.map(o => ({
                        object: o,
                        detailedDescriptions: this.getVisibleDetailedDescriptions(o.detailedDescriptions, playerPerception)
                    }));
                    
                    // Collect all other NPCs with their detailed descriptions
                    const otherNPCs = (context.npcs || [])
                        .filter(n => n.id !== npc.id)
                        .map(n => ({
                            npc: n,
                            detailedDescriptions: this.getVisibleDetailedDescriptions(n.detailedDescriptions, playerPerception)
                        }));
                    
                    // Collect all exits with their detailed descriptions
                    const exits = (context.exits || []).map(exit => ({
                        exit: exit,
                        detailedDescriptions: this.getVisibleDetailedDescriptions(exit.detailedDescriptions, playerPerception)
                    }));
                    
                    const aiAnswer = await answerQuestionAboutTarget(
                        intent.originalInput,
                        npcDescription,
                        visibleDetails,
                        {
                            sceneNarrative: context.narrative,
                            sceneDetailedDescriptions: this.getVisibleDetailedDescriptions(context.detailedDescriptions, playerPerception),
                            otherObjects: otherObjects,
                            npcs: otherNPCs,
                            exits: exits
                        }
                    );
                    
                    return {
                        outcome: 'success',
                        narrativeResolver: aiAnswer,
                        effects: undefined,
                        nextSceneId: undefined
                    };
                }
                
                // Procedural handling for non-questions
                lookText = npc.description || `${npc.name} is here.`;

                // Add detailed descriptions
                const visibleDetails = this.getVisibleDetailedDescriptions(npc.detailedDescriptions, playerPerception);
                if (visibleDetails.length > 0) {
                    for (const detail of visibleDetails) {
                        lookText += '\n\n' + detail.text;
                        if (detail.effects) {
                            effectsList.push(detail.effects);
                        }
                    }
                }

                const mergedEffects = this.mergeEffects(effectsList);
                return {
                    outcome: 'success',
                    narrativeResolver: lookText,
                    effects: Object.keys(mergedEffects).length > 0 ? mergedEffects : undefined,
                    nextSceneId: undefined
                };
            }
        }

        // Try to match as an exit
        if (context.exits) {
            // Match by direction, name, or description (case-insensitive)
            const exit = context.exits.find(e => 
                e.direction.toLowerCase() === lowerTargetId ||
                e.name?.toLowerCase().includes(lowerTargetId) ||
                e.description?.toLowerCase().includes(lowerTargetId)
            );
            if (exit) {
                // If it's a question, use AI to answer it
                if (isQuestion && intent.originalInput) {
                    const visibleDetails = this.getVisibleDetailedDescriptions(exit.detailedDescriptions, playerPerception);
                    const exitDescription = exit.description || exit.name || `A ${exit.direction.toUpperCase()} exit.`;
                    
                    // Collect all objects with their detailed descriptions (including dropped objects)
                    const otherObjects = sceneObjects.map(o => ({
                        object: o,
                        detailedDescriptions: this.getVisibleDetailedDescriptions(o.detailedDescriptions, playerPerception)
                    }));
                    
                    // Collect all NPCs with their detailed descriptions
                    const npcs = (context.npcs || []).map(n => ({
                        npc: n,
                        detailedDescriptions: this.getVisibleDetailedDescriptions(n.detailedDescriptions, playerPerception)
                    }));
                    
                    // Collect all other exits with their detailed descriptions
                    const otherExits = (context.exits || [])
                        .filter(e => e.direction !== exit.direction)
                        .map(e => ({
                            exit: e,
                            detailedDescriptions: this.getVisibleDetailedDescriptions(e.detailedDescriptions, playerPerception)
                        }));
                    
                    const aiAnswer = await answerQuestionAboutTarget(
                        intent.originalInput,
                        exitDescription,
                        visibleDetails,
                        {
                            sceneNarrative: context.narrative,
                            sceneDetailedDescriptions: this.getVisibleDetailedDescriptions(context.detailedDescriptions, playerPerception),
                            otherObjects: otherObjects,
                            npcs: npcs,
                            exits: otherExits
                        }
                    );
                    
                    return {
                        outcome: 'success',
                        narrativeResolver: aiAnswer,
                        effects: undefined,
                        nextSceneId: undefined
                    };
                }
                
                // Procedural handling for non-questions
                lookText = exit.description || exit.name || `A ${exit.direction.toUpperCase()} exit.`;

                // Add detailed descriptions
                const visibleDetails = this.getVisibleDetailedDescriptions(exit.detailedDescriptions, playerPerception);
                if (visibleDetails.length > 0) {
                    for (const detail of visibleDetails) {
                        lookText += '\n\n' + detail.text;
                        if (detail.effects) {
                            effectsList.push(detail.effects);
                        }
                    }
                }

                const mergedEffects = this.mergeEffects(effectsList);
                return {
                    outcome: 'success',
                    narrativeResolver: lookText,
                    effects: Object.keys(mergedEffects).length > 0 ? mergedEffects : undefined,
                    nextSceneId: undefined
                };
            }
        }

        // Try to match as scene
        if (targetId.toLowerCase() === context.id.toLowerCase() || lowerTargetId === 'scene') {
            // If it's a question, use AI to answer it
            if (isQuestion && intent.originalInput) {
                const visibleDetails = this.getVisibleDetailedDescriptions(context.detailedDescriptions, playerPerception);
                const sceneDescription = context.narrative || "You look around.";
                
                // Collect all objects with their detailed descriptions (including dropped objects)
                const otherObjects = sceneObjects.map(o => ({
                    object: o,
                    detailedDescriptions: this.getVisibleDetailedDescriptions(o.detailedDescriptions, playerPerception)
                }));
                
                // Collect all NPCs with their detailed descriptions
                const npcs = (context.npcs || []).map(n => ({
                    npc: n,
                    detailedDescriptions: this.getVisibleDetailedDescriptions(n.detailedDescriptions, playerPerception)
                }));
                
                // Collect all exits with their detailed descriptions
                const exits = (context.exits || []).map(e => ({
                    exit: e,
                    detailedDescriptions: this.getVisibleDetailedDescriptions(e.detailedDescriptions, playerPerception)
                }));
                
                const aiAnswer = await answerQuestionAboutTarget(
                    intent.originalInput,
                    sceneDescription,
                    visibleDetails,
                    {
                        sceneNarrative: context.narrative,
                        sceneDetailedDescriptions: visibleDetails,
                        otherObjects: otherObjects,
                        npcs: npcs,
                        exits: exits
                    }
                );
                
                return {
                    outcome: 'success',
                    narrativeResolver: aiAnswer,
                    effects: undefined,
                    nextSceneId: undefined
                };
            }
            
            // Procedural handling for non-questions
            lookText = context.narrative || "You look around.";

            // Add detailed descriptions
            const visibleDetails = this.getVisibleDetailedDescriptions(context.detailedDescriptions, playerPerception);
            if (visibleDetails.length > 0) {
                for (const detail of visibleDetails) {
                    lookText += '\n\n' + detail.text;
                    if (detail.effects) {
                        effectsList.push(detail.effects);
                    }
                }
            }

            const mergedEffects = this.mergeEffects(effectsList);
            return {
                outcome: 'success',
                narrativeResolver: lookText,
                effects: Object.keys(mergedEffects).length > 0 ? mergedEffects : undefined,
                nextSceneId: undefined
            };
        }

        // No match found - use original target from input if available, otherwise use targetId
        const originalTarget = intent.originalInput 
            ? this.extractTargetFromInput(intent.originalInput)
            : targetId;
        return {
            outcome: 'failure',
            narrativeResolver: `You don't see "${originalTarget}" here.`,
            effects: undefined
        };
    }

    /**
     * Resolve a general look (no target) - show scene overview.
     */
    private resolveGeneralLook(
        state: GameState,
        _intent: ActionIntent,
        context: SceneContext,
        playerPerception: number,
        calc: StatCalculator,
        _objectsMap: Record<string, GameObject>
    ): ResolutionResult {
        // Look command - show scene narrative, visible objects, visible NPCs, and visible exits
        let lookText = context.narrative || "You look around.";
        
        // Add scene detailed descriptions
        const visibleDetails = this.getVisibleDetailedDescriptions(context.detailedDescriptions, playerPerception);
        const effectsList: ActionEffects[] = [];
        if (visibleDetails.length > 0) {
            for (const detail of visibleDetails) {
                lookText += '\n\n' + detail.text;
                if (detail.effects) {
                    effectsList.push(detail.effects);
                }
            }
        }
        
        // Get objects from state.sceneObjects (the source of truth) instead of just context.objects
        // This ensures dropped objects are visible. state.sceneObjects is the authoritative source.
        const sceneObjects = state.sceneObjects[state.currentSceneId] || [];
        const visibleObjects = getVisibleObjects(sceneObjects, playerPerception);
        
        // List visible objects
        if (visibleObjects.length > 0) {
            lookText += "\n\nYou notice:";
            for (const obj of visibleObjects) {
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
                    const npcObjectsMap: Record<string, GameObject> = {};
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
                for (const { npc } of visibleNPCs) {
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
        
        // Apply viewEffects for objects when looking
        if (visibleObjects.length > 0) {
            const viewEffectsList: ActionEffects[] = [];
            for (const obj of visibleObjects) {
                if (obj.viewEffects) {
                    viewEffectsList.push(obj.viewEffects);
                }
            }
            // Add view effects to the effects list
            effectsList.push(...viewEffectsList);
        }

        // Merge all effects (from detailed descriptions and object viewEffects)
        const mergedEffects = this.mergeEffects(effectsList);

        return {
            outcome: 'success',
            narrativeResolver: lookText,
            effects: Object.keys(mergedEffects).length > 0 ? mergedEffects : undefined,
            nextSceneId: undefined
        };
    }
}

