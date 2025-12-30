import { CharacterState, StatBlock, CharacterEffect } from './types';
import { GameObject } from './game-object';

/**
 * Calculates current stats from base stats + object modifiers + effect modifiers
 */
export class StatCalculator {
    /**
     * Calculate current stats from base stats + effect static modifiers
     * Note: Objects no longer have statModifiers - stat modifiers should be applied via effects
     */
    calculateCurrentStats(
        character: CharacterState,
        _objects: Record<string, GameObject>
    ): StatBlock {
        // Start with base stats
        const current: StatBlock = { ...character.baseStats };

        // Apply effect static modifiers (effects applied via carryEffects when items are picked up)
        const effectModifiers = this.getEffectModifiers(character.effects);
        for (const [key, value] of Object.entries(effectModifiers)) {
            const statKey = key as keyof StatBlock;
            current[statKey] = (current[statKey] || 0) + (value || 0);
        }

        return current;
    }

    /**
     * Get a single current stat value
     */
    getEffectiveStat(
        character: CharacterState,
        statName: keyof StatBlock,
        objects: Record<string, GameObject>
    ): number {
        const currentStats = this.calculateCurrentStats(character, objects);
        return currentStats[statName];
    }

    /**
     * Update character's current stats (recalculates from base + modifiers)
     */
    updateCharacterStats(
        character: CharacterState,
        objects: Record<string, GameObject>
    ): CharacterState {
        const currentStats = this.calculateCurrentStats(character, objects);
        return new CharacterState({
            ...character,
            stats: currentStats
        });
    }

    /**
     * Get all stat modifiers from active effects (static modifiers only)
     */
    private getEffectModifiers(effects: CharacterEffect[]): Partial<StatBlock> {
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
}

