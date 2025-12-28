import { CharacterState, StatBlock, ObjectDefinition, CharacterEffect } from './types';

/**
 * Calculates current stats from base stats + object modifiers + effect modifiers
 */
export class StatCalculator {
    /**
     * Calculate current stats from base stats + object modifiers + effect static modifiers
     */
    calculateCurrentStats(
        character: CharacterState,
        objects: Record<string, ObjectDefinition>
    ): StatBlock {
        // Start with base stats
        const current: StatBlock = { ...character.baseStats };

        // Apply object stat modifiers
        const objectModifiers = this.getObjectModifiers(character, objects);
        for (const [key, value] of Object.entries(objectModifiers)) {
            const statKey = key as keyof StatBlock;
            current[statKey] = (current[statKey] || 0) + (value || 0);
        }

        // Apply effect static modifiers
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
        objects: Record<string, ObjectDefinition>
    ): number {
        const currentStats = this.calculateCurrentStats(character, objects);
        return currentStats[statName];
    }

    /**
     * Update character's current stats (recalculates from base + modifiers)
     */
    updateCharacterStats(
        character: CharacterState,
        objects: Record<string, ObjectDefinition>
    ): CharacterState {
        const currentStats = this.calculateCurrentStats(character, objects);
        return {
            ...character,
            stats: currentStats
        };
    }

    /**
     * Get all stat modifiers from carried objects
     */
    private getObjectModifiers(
        character: CharacterState,
        objects: Record<string, ObjectDefinition>
    ): Partial<StatBlock> {
        const modifiers: Partial<StatBlock> = {};

        for (const entry of character.inventory) {
            const objectData = entry.objectData || objects[entry.id];
            if (!objectData) continue;

            // Apply modifiers from this object (if it has any)
            if (objectData.statModifiers) {
                for (const [key, value] of Object.entries(objectData.statModifiers)) {
                    const statKey = key as keyof StatBlock;
                    modifiers[statKey] = (modifiers[statKey] || 0) + (value || 0);
                }
            }

            // Also check nested objects in containers (even if container has no statModifiers)
            if (objectData.contains) {
                for (const nestedObject of objectData.contains) {
                    if (nestedObject.statModifiers) {
                        for (const [key, value] of Object.entries(nestedObject.statModifiers)) {
                            const statKey = key as keyof StatBlock;
                            modifiers[statKey] = (modifiers[statKey] || 0) + (value || 0);
                        }
                    }
                    // Recursively check nested containers
                    if (nestedObject.contains) {
                        for (const deeplyNested of nestedObject.contains) {
                            if (deeplyNested.statModifiers) {
                                for (const [key, value] of Object.entries(deeplyNested.statModifiers)) {
                                    const statKey = key as keyof StatBlock;
                                    modifiers[statKey] = (modifiers[statKey] || 0) + (value || 0);
                                }
                            }
                        }
                    }
                }
            }
        }

        return modifiers;
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

