import { z } from 'zod';
import { ActionIntent, GameState, ResolutionResult } from '../types';
import { SceneContext } from '../engine';
import { NormalizedCommandInput } from '../command';
import { StatCalculator } from '../stats';
import { EffectManager } from '../effects';

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
     * Execute the command, creating an ActionIntent from normalized input.
     * 
     * @param input Normalized command input with commandId and parameters
     * @param context Scene context with choices, objects, etc.
     * @returns ActionIntent ready to be processed by the engine
     */
    execute(input: NormalizedCommandInput, context: SceneContext): ActionIntent;

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
    resolve(state: GameState, intent: ActionIntent, context: SceneContext, statCalculator?: StatCalculator, effectManager?: EffectManager): ResolutionResult;
}

