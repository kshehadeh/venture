import { GameState, ActionRequirements, ItemId } from "./types";
import { getEffectiveStrength } from "./container";
import { StatCalculator } from "./stats";
import { GameObject } from "./game-object";

export type ValidationResult = { valid: true } | { valid: false; reason: string };

export function validateRequirements(
    state: GameState,
    reqs?: ActionRequirements,
    characterId: string = 'player'
): ValidationResult {
    if (!reqs) return { valid: true };

    const char = state.characters[characterId];
    if (!char) {
        return { valid: false, reason: `Character not found: ${characterId}` };
    }

    // Get current stats using StatCalculator
    const statCalculator = new StatCalculator();
    const objectsMap: Record<string, GameObject> = {};
    for (const entry of char.inventory) {
        if (entry.objectData) {
            objectsMap[entry.id] = entry.objectData;
        }
    }
    const currentStats = statCalculator.calculateCurrentStats(char, objectsMap);

    // 1. Stats (use current stats)
    if (reqs.stats) {
        for (const [key, minVal] of Object.entries(reqs.stats)) {
            const k = key as keyof typeof currentStats;
            if (currentStats[k] < (minVal || 0)) {
                return {
                    valid: false,
                    reason: `Insufficient ${k}: requires ${minVal}, have ${currentStats[k]}`
                };
            }
        }
    }

    // 2. Traits
    if (reqs.traits) {
        for (const trait of reqs.traits) {
            if (!char.traits.has(trait)) {
                return { valid: false, reason: `Missing trait: ${trait}` };
            }
        }
    }

    // 3. Flags (Global or Character?) -> Docs imply mix, but architecture puts flags on World mostly.
    //    Type definition put flags on both. Let's check both for flexibility, or prioritize logic.
    //    Architecture: "ChoiceRequirement... flags?: string[]"
    //    Let's check global world flags and character flags.
    if (reqs.flags) {
        for (const flag of reqs.flags) {
            const hasCharFlag = char.flags.has(flag);
            const hasWorldFlag = state.world.globalFlags.has(flag);
            if (!hasCharFlag && !hasWorldFlag) {
                return { valid: false, reason: `Missing flag: ${flag}` };
            }
        }
    }

    // 4. Items
    if (reqs.items) {
        for (const reqItem of reqs.items) {
            const invItem = char.inventory.find(i => i.id === reqItem.id);
            const qty = invItem ? invItem.quantity : 0;
            if (qty < reqItem.quantity) {
                return {
                    valid: false,
                    reason: `Insufficient item ${reqItem.id}: requires ${reqItem.quantity}, have ${qty}`
                };
            }
        }
    }

    return { valid: true };
}

/**
 * Validate if character can carry an object based on strength and current inventory weight.
 */
export function validateCarryingCapacity(
    state: GameState,
    object: GameObject,
    characterId: string = 'player'
): ValidationResult {
    const char = state.characters[characterId];
    if (!char) {
        return { valid: false, reason: `Character not found: ${characterId}` };
    }
    
    // Get current strength using StatCalculator
    const statCalculator = new StatCalculator();
    const objectsMap: Record<ItemId, GameObject> = {};
    for (const entry of char.inventory) {
        if (entry.objectData) {
            objectsMap[entry.id] = entry.objectData;
        }
    }
    const currentStrength = statCalculator.getEffectiveStat(char, 'strength', objectsMap);
    
    // Calculate effective strength (including container bonuses)
    const effectiveStrength = getEffectiveStrength(currentStrength, char.inventory, objectsMap);
    
    // Carrying capacity = strength * 10 (configurable multiplier)
    const carryingCapacity = effectiveStrength * 10;
    
    // Calculate current total weight (objectsMap already built above)
    let currentWeight = 0;
    for (const entry of char.inventory) {
        if (entry.objectData) {
            currentWeight += entry.objectData.getTotalWeight(objectsMap);
        } else {
            // For non-container items, we need to look up weight
            // For now, assume 0 if we don't have objectData
            // In a full implementation, we'd have an objects registry
            currentWeight += 0; // Placeholder
        }
    }
    
    // Calculate object weight
    const objectWeight = object.getTotalWeight(objectsMap);
    
    // Check if adding object would exceed capacity
    if (currentWeight + objectWeight > carryingCapacity) {
        return {
            valid: false,
            reason: `You can't carry that much. Your carrying capacity is ${carryingCapacity}, and you're already carrying ${currentWeight.toFixed(1)}.`
        };
    }
    
    return { valid: true };
}

