import { z } from 'zod';
import { ActionIntent, GameState, ResolutionResult } from '../types';
import type { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { StatCalculator } from '../stats';
import { EffectManager } from '../effects';
import { ParsedCommand } from '../utils/nlp-parser';

/**
 * Base interface for all command classes.
 * Commands are responsible for creating ActionIntent from normalized input
 * and resolving the action to produce game state changes.
 */
export interface Command {
    /**
     * Get the command ID this command handles (e.g., "look", "pickup", "items").
     */
    getCommandId(): string;

    /**
     * Get the Zod schema for this command's parameters.
     * This schema is used by the AI processor to extract and validate parameters.
     */
    getParameterSchema(): z.ZodSchema;

    /**
     * Extract parameters from user input using AI.
     * This is called by the AI processor after the command has been identified.
     * Each command can implement its own logic for parameter extraction.
     * 
     * @param userInput Raw user input string
     * @param context Scene context with objects, NPCs, exits, etc.
     * @returns Normalized command input with extracted parameters, or null if extraction fails
     */
    extractParameters?(userInput: string, context: SceneContext): Promise<NormalizedCommandInput | null>;

    /**
     * Execute the command, creating an ActionIntent from normalized input.
     * 
     * @param input Normalized command input with commandId and parameters
     * @param context Scene context with objects, exits, NPCs, etc.
     * @param originalInput Optional original user input for AI fallback in commands
     * @returns ActionIntent ready to be processed by the engine
     */
    execute(input: NormalizedCommandInput, context: SceneContext, originalInput?: string): ActionIntent;

    /**
     * Resolve the action, producing the game state changes and narrative.
     * 
     * @param state Current game state
     * @param intent The action intent to resolve
     * @param context Scene context
     * @param statCalculator Optional stat calculator for stat-dependent commands
     * @param effectManager Optional effect manager for effect-dependent commands
     * @returns Resolution result with narrative, effects, and next scene
     */
    resolve(state: GameState, intent: ActionIntent, context: SceneContext, statCalculator?: StatCalculator, effectManager?: EffectManager): ResolutionResult | Promise<ResolutionResult>;

    /**
     * Check if this command matches the given ActionIntent.
     * 
     * @param intent The action intent to check
     * @returns true if this command handles the given intent, false otherwise
     */
    matchesIntent(intent: ActionIntent): boolean;

    /**
     * Get aliases and variations for this command.
     * These are used by the verb mapper to match user input to commands.
     * 
     * @returns Object containing arrays of single-word aliases and phrasal verb aliases
     */
    getAliases(): {
        singleWords: string[];
        phrasalVerbs: string[];
    };

    /**
     * Process user input procedurally (without AI).
     * This is called by the procedural processor to extract parameters from parsed NLP output.
     * 
     * @param parsed Parsed command from NLP parser (verb, target, verbPhrase)
     * @param input Original user input string
     * @param context Scene context with objects, NPCs, exits, etc.
     * @returns Normalized command input with extracted parameters, or null if procedural processing fails
     */
    processProcedural?(parsed: ParsedCommand, input: string, context: SceneContext): NormalizedCommandInput | null;
}

