import { CharacterState, StatBlock, CharacterEffect, EffectDefinition } from './types';

/**
 * Represents a single effect instance on a character
 */
export class Effect {
    readonly id: string;
    readonly source: 'builtin' | 'game';
    duration?: number;
    readonly statModifiers?: Partial<StatBlock>;
    readonly perTurnModifiers?: Partial<StatBlock>;
    readonly metadata?: Record<string, any>;

    constructor(definition: EffectDefinition, duration?: number) {
        this.id = definition.id;
        this.source = definition.builtin ? 'builtin' : 'game';
        this.duration = duration !== undefined ? duration : definition.duration;
        this.statModifiers = definition.statModifiers ? { ...definition.statModifiers } : undefined;
        this.perTurnModifiers = definition.perTurnModifiers ? { ...definition.perTurnModifiers } : undefined;
        this.metadata = {};
    }

    /**
     * Apply per-turn modifiers to base stats (for cumulative effects)
     */
    applyPerTurnModifiers(baseStats: StatBlock): StatBlock {
        if (!this.perTurnModifiers) {
            return { ...baseStats };
        }

        const result: StatBlock = { ...baseStats };
        for (const [key, value] of Object.entries(this.perTurnModifiers)) {
            const statKey = key as keyof StatBlock;
            result[statKey] = (result[statKey] || 0) + (value || 0);
        }
        return result;
    }

    /**
     * Check if effect should be removed (duration reached 0)
     */
    shouldRemove(): boolean {
        if (this.duration === undefined) {
            return false; // Permanent effect
        }
        return this.duration <= 0;
    }

    /**
     * Decrement duration by 1 turn
     */
    tick(): Effect {
        if (this.duration === undefined) {
            return this; // Permanent effect, no change
        }
        return {
            ...this,
            duration: this.duration - 1
        };
    }
}

/**
 * Manages effect application, removal, and ticking for characters
 */
export class EffectManager {
    private builtinDefinitions: Record<string, EffectDefinition>;
    private gameDefinitions: Record<string, EffectDefinition>;

    constructor(gameDefinitions?: Record<string, EffectDefinition>) {
        this.gameDefinitions = gameDefinitions || {};
        this.builtinDefinitions = this.initializeBuiltinEffects();
    }

    /**
     * Initialize built-in effect definitions
     */
    private initializeBuiltinEffects(): Record<string, EffectDefinition> {
        return {
            blindness: {
                id: 'blindness',
                name: 'Blindness',
                description: 'Your vision is completely obscured.',
                statModifiers: { perception: -999 }, // Set to effectively 0
                builtin: true
            },
            unconscious: {
                id: 'unconscious',
                name: 'Unconscious',
                description: 'You are unconscious and cannot act.',
                statModifiers: { agility: -999 }, // Set to effectively 0
                builtin: true
            },
            dead: {
                id: 'dead',
                name: 'Dead',
                description: 'You are dead.',
                statModifiers: { health: -999, agility: -999 }, // Set to effectively 0
                builtin: true
            },
            poison: {
                id: 'poison',
                name: 'Poisoned',
                description: 'You feel a burning sensation.',
                perTurnModifiers: { health: -1 },
                duration: 5, // Default duration
                builtin: true
            }
        };
    }

    /**
     * Apply an effect to a character
     */
    applyEffect(
        character: CharacterState,
        effectId: string,
        duration?: number
    ): CharacterState {
        const definition = this.getEffectDefinition(effectId);
        if (!definition) {
            throw new Error(`Unknown effect ID: ${effectId}`);
        }

        const effect = new Effect(definition, duration);
        const effectData: CharacterEffect = {
            id: effect.id,
            source: effect.source,
            duration: effect.duration,
            statModifiers: effect.statModifiers,
            perTurnModifiers: effect.perTurnModifiers,
            metadata: effect.metadata
        };

        return character.addEffect(effectData);
    }

    /**
     * Remove an effect from a character
     */
    removeEffect(character: CharacterState, effectId: string): CharacterState {
        return character.removeEffect(effectId);
    }

    /**
     * Tick all effects (decrement durations, apply per-turn modifiers, remove expired)
     * Returns updated character with effects ticked and base stats updated for cumulative effects
     */
    tickEffects(character: CharacterState): CharacterState {
        let updatedBaseStats = { ...character.baseStats };
        const updatedEffects: CharacterEffect[] = [];

        // Process each effect
        for (const effectData of character.effects) {
            // Apply per-turn modifiers to base stats (cumulative)
            if (effectData.perTurnModifiers) {
                for (const [key, value] of Object.entries(effectData.perTurnModifiers)) {
                    const statKey = key as keyof StatBlock;
                    updatedBaseStats[statKey] = (updatedBaseStats[statKey] || 0) + (value || 0);
                }
            }

            // Tick the effect (decrement duration)
            // Check if effect should be removed (duration <= 0)
            let shouldRemove = false;
            let newDuration: number | undefined = effectData.duration;

            if (effectData.duration !== undefined) {
                newDuration = effectData.duration - 1;
                shouldRemove = newDuration <= 0;
            }

            // Only keep effects that haven't expired
            if (!shouldRemove) {
                updatedEffects.push({
                    ...effectData,
                    duration: newDuration
                });
            }
        }

        return new CharacterState({
            ...character,
            baseStats: updatedBaseStats,
            effects: updatedEffects
        });
    }

    /**
     * Get built-in effect definition
     */
    getBuiltinEffectDefinition(effectId: string): EffectDefinition | null {
        return this.builtinDefinitions[effectId] || null;
    }

    /**
     * Get effect definition (built-in or game-specific)
     */
    getEffectDefinition(effectId: string): EffectDefinition | null {
        // Check built-in first
        const builtin = this.getBuiltinEffectDefinition(effectId);
        if (builtin) {
            return builtin;
        }

        // Check game-specific
        return this.gameDefinitions[effectId] || null;
    }

    /**
     * Merge all static stat modifiers from active effects
     */
    mergeEffectModifiers(effects: CharacterEffect[]): Partial<StatBlock> {
        const modifiers: Partial<StatBlock> = {};

        for (const effect of effects) {
            if (!effect.statModifiers) continue;

            for (const [key, value] of Object.entries(effect.statModifiers)) {
                const statKey = key as keyof StatBlock;
                modifiers[statKey] = (modifiers[statKey] || 0) + (value || 0);
            }
        }

        return modifiers;
    }

    /**
     * Merge all per-turn modifiers from active effects
     */
    mergePerTurnModifiers(effects: CharacterEffect[]): Partial<StatBlock> {
        const modifiers: Partial<StatBlock> = {};

        for (const effect of effects) {
            if (!effect.perTurnModifiers) continue;

            for (const [key, value] of Object.entries(effect.perTurnModifiers)) {
                const statKey = key as keyof StatBlock;
                modifiers[statKey] = (modifiers[statKey] || 0) + (value || 0);
            }
        }

        return modifiers;
    }
}

