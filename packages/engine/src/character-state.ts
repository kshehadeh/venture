import { StatBlock, TraitId, FlagId, InventoryEntry, CharacterEffect } from './types';
import { GameObject } from './game-object';

/**
 * Represents the state of a character (player or NPC) in the game.
 */
export class CharacterState {
    id: string; // "player" or npc id
    name: string;
    baseStats: StatBlock; // Immutable base values
    stats: StatBlock; // Current calculated stats
    traits: Set<TraitId>;
    inventory: InventoryEntry[];
    flags: Set<FlagId>; // Character-specific flags
    effects: CharacterEffect[]; // Active effects on this character

    constructor(data: {
        id: string;
        name: string;
        baseStats: StatBlock;
        stats: StatBlock;
        traits: Set<TraitId>;
        inventory: InventoryEntry[];
        flags: Set<FlagId>;
        effects: CharacterEffect[];
    }) {
        this.id = data.id;
        this.name = data.name;
        this.baseStats = { ...data.baseStats };
        this.stats = { ...data.stats };
        this.traits = new Set(data.traits);
        this.inventory = [...data.inventory];
        this.flags = new Set(data.flags);
        this.effects = [...data.effects];
    }

    updateBaseStats(deltas: Partial<StatBlock>): CharacterState {
        const newBaseStats = { ...this.baseStats };
        for (const [key, delta] of Object.entries(deltas)) {
            const k = key as keyof StatBlock;
            newBaseStats[k] = (newBaseStats[k] || 0) + (delta || 0);
        }
        return new CharacterState({
            id: this.id,
            name: this.name,
            baseStats: newBaseStats,
            stats: this.stats,
            traits: this.traits,
            inventory: this.inventory,
            flags: this.flags,
            effects: this.effects
        });
    }

    addTrait(trait: TraitId): CharacterState {
        const newTraits = new Set(this.traits);
        newTraits.add(trait);
        return new CharacterState({
            id: this.id,
            name: this.name,
            baseStats: this.baseStats,
            stats: this.stats,
            traits: newTraits,
            inventory: this.inventory,
            flags: this.flags,
            effects: this.effects
        });
    }

    removeTrait(trait: TraitId): CharacterState {
        const newTraits = new Set(this.traits);
        newTraits.delete(trait);
        return new CharacterState({
            id: this.id,
            name: this.name,
            baseStats: this.baseStats,
            stats: this.stats,
            traits: newTraits,
            inventory: this.inventory,
            flags: this.flags,
            effects: this.effects
        });
    }

    addFlag(flag: FlagId): CharacterState {
        const newFlags = new Set(this.flags);
        newFlags.add(flag);
        return new CharacterState({
            id: this.id,
            name: this.name,
            baseStats: this.baseStats,
            stats: this.stats,
            traits: this.traits,
            inventory: this.inventory,
            flags: newFlags,
            effects: this.effects
        });
    }

    removeFlag(flag: FlagId): CharacterState {
        const newFlags = new Set(this.flags);
        newFlags.delete(flag);
        return new CharacterState({
            id: this.id,
            name: this.name,
            baseStats: this.baseStats,
            stats: this.stats,
            traits: this.traits,
            inventory: this.inventory,
            flags: newFlags,
            effects: this.effects
        });
    }

    addToInventory(item: InventoryEntry, objectDef?: GameObject): CharacterState {
        const newInventory = [...this.inventory];
        const existingIdx = newInventory.findIndex(i => i.id === item.id);
        if (existingIdx >= 0) {
            const existing = newInventory[existingIdx];
            newInventory[existingIdx] = {
                ...existing,
                quantity: existing.quantity + item.quantity,
                objectData: objectDef || item.objectData || existing.objectData
            };
        } else {
            newInventory.push({
                ...item,
                objectData: objectDef || item.objectData
            });
        }
        return new CharacterState({
            id: this.id,
            name: this.name,
            baseStats: this.baseStats,
            stats: this.stats,
            traits: this.traits,
            inventory: newInventory,
            flags: this.flags,
            effects: this.effects
        });
    }

    removeFromInventory(itemId: string, quantity: number): CharacterState {
        const newInventory = [...this.inventory];
        const existingIdx = newInventory.findIndex(i => i.id === itemId);
        if (existingIdx >= 0) {
            const existing = newInventory[existingIdx];
            const newQty = existing.quantity - quantity;
            if (newQty <= 0) {
                newInventory.splice(existingIdx, 1);
            } else {
                newInventory[existingIdx] = { ...existing, quantity: newQty };
            }
        }
        return new CharacterState({
            id: this.id,
            name: this.name,
            baseStats: this.baseStats,
            stats: this.stats,
            traits: this.traits,
            inventory: newInventory,
            flags: this.flags,
            effects: this.effects
        });
    }

    updateInventory(updater: (inventory: InventoryEntry[]) => InventoryEntry[]): CharacterState {
        return new CharacterState({
            id: this.id,
            name: this.name,
            baseStats: this.baseStats,
            stats: this.stats,
            traits: this.traits,
            inventory: updater([...this.inventory]),
            flags: this.flags,
            effects: this.effects
        });
    }

    addEffect(effect: CharacterEffect): CharacterState {
        return new CharacterState({
            id: this.id,
            name: this.name,
            baseStats: this.baseStats,
            stats: this.stats,
            traits: this.traits,
            inventory: this.inventory,
            flags: this.flags,
            effects: [...this.effects, effect]
        });
    }

    removeEffect(effectId: string): CharacterState {
        const index = this.effects.findIndex(e => e.id === effectId);
        if (index === -1) {
            return this; // Effect not found, return unchanged
        }
        
        // Remove only the first occurrence
        const newEffects = [...this.effects];
        newEffects.splice(index, 1);
        
        return new CharacterState({
            id: this.id,
            name: this.name,
            baseStats: this.baseStats,
            stats: this.stats,
            traits: this.traits,
            inventory: this.inventory,
            flags: this.flags,
            effects: newEffects
        });
    }

    updateEffects(updater: (effects: CharacterEffect[]) => CharacterEffect[]): CharacterState {
        return new CharacterState({
            id: this.id,
            name: this.name,
            baseStats: this.baseStats,
            stats: this.stats,
            traits: this.traits,
            inventory: this.inventory,
            flags: this.flags,
            effects: updater([...this.effects])
        });
    }

    clone(): CharacterState {
        return new CharacterState({
            id: this.id,
            name: this.name,
            baseStats: { ...this.baseStats },
            stats: { ...this.stats },
            traits: new Set(this.traits),
            inventory: [...this.inventory],
            flags: new Set(this.flags),
            effects: [...this.effects]
        });
    }

    toJSON(): any {
        return {
            id: this.id,
            name: this.name,
            baseStats: this.baseStats,
            stats: this.stats,
            traits: Array.from(this.traits),
            inventory: this.inventory,
            flags: Array.from(this.flags),
            effects: this.effects
        };
    }
}

