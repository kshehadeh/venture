// @ts-ignore - bun:test is available at runtime
import { describe, it, expect } from 'bun:test';
import { ObjectDefinition, InventoryEntry } from '../src/types';
import { createTestCharacterState, createTestStatCalculator, createTestEffect } from './helpers/effect-test-helpers';
import { GameObject } from '../src/game-object';

describe('StatCalculator', () => {
    describe('calculateCurrentStats', () => {
        it('should return base stats when no modifiers present', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test', {
                health: 10,
                willpower: 5,
                perception: 3,
                reputation: 0,
                strength: 5,
                agility: 5
            });

            const currentStats = calculator.calculateCurrentStats(character, {});

            expect(currentStats.health).toBe(10);
            expect(currentStats.willpower).toBe(5);
            expect(currentStats.perception).toBe(3);
            expect(currentStats.reputation).toBe(0);
            expect(currentStats.strength).toBe(5);
            expect(currentStats.agility).toBe(5);
        });

        it('should apply effect stat modifiers correctly', () => {
            const calculator = createTestStatCalculator();
            // Add effects that would be applied when carrying the sword (via carryEffects)
            const character = createTestCharacterState('test', 'Test', undefined, [
                createTestEffect('sword-strength', 'game', undefined, { strength: 2, agility: 1 })
            ]);

            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            const inventoryEntry: InventoryEntry = {
                id: 'sword',
                quantity: 1,
                objectData: GameObject.fromJSON(sword)
            };

            character.inventory.push(inventoryEntry);
            const objectsMap = { sword: GameObject.fromJSON(sword) };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            expect(currentStats.strength).toBe(7); // 5 base + 2 from effect
            expect(currentStats.agility).toBe(6); // 5 base + 1 from effect
            expect(currentStats.health).toBe(10); // Unchanged
        });

        it('should apply effect static modifiers correctly', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');
            character.effects = [
                {
                    id: 'test-effect',
                    source: 'game',
                    statModifiers: { perception: -2, willpower: 1 }
                }
            ];

            const currentStats = calculator.calculateCurrentStats(character, {});

            expect(currentStats.perception).toBe(0); // 2 base - 2 from effect
            expect(currentStats.willpower).toBe(6); // 5 base + 1 from effect
        });

        it('should combine multiple effect modifiers (additive)', () => {
            const calculator = createTestStatCalculator();
            // Add effects that would be applied when carrying the sword and shield (via carryEffects)
            const character = createTestCharacterState('test', 'Test', undefined, [
                createTestEffect('sword-strength', 'game', undefined, { strength: 2 }),
                createTestEffect('shield-bonus', 'game', undefined, { strength: 1, health: 5 })
            ]);
            
            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            const shield: ObjectDefinition = {
                id: 'shield',
                weight: 3,
                perception: 0,
                removable: true,
                description: 'A shield',
                traits: []
            };

            const swordObj = GameObject.fromJSON(sword);
            const shieldObj = GameObject.fromJSON(shield);
            character.inventory.push(
                { id: 'sword', quantity: 1, objectData: swordObj },
                { id: 'shield', quantity: 1, objectData: shieldObj }
            );
            const objectsMap = { sword: swordObj, shield: shieldObj };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            expect(currentStats.strength).toBe(8); // 5 base + 2 + 1
            expect(currentStats.health).toBe(15); // 10 base + 5
        });

        it('should combine multiple effect modifiers (additive)', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');
            character.effects = [
                {
                    id: 'effect1',
                    source: 'game',
                    statModifiers: { perception: 2 }
                },
                {
                    id: 'effect2',
                    source: 'game',
                    statModifiers: { perception: 1, willpower: -1 }
                }
            ];

            const currentStats = calculator.calculateCurrentStats(character, {});

            expect(currentStats.perception).toBe(5); // 2 base + 2 + 1
            expect(currentStats.willpower).toBe(4); // 5 base - 1
        });

        it('should handle negative modifiers correctly', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the cursed item (via carryEffects)
            const character = createTestCharacterState('test', 'Test', {
                health: 10,
                strength: 5
            }, [
                createTestEffect('cursed-item-effect', 'game', undefined, { strength: -3, health: -2 })
            ]);
            
            const cursedItem: ObjectDefinition = {
                id: 'cursed-item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A cursed item',
                traits: []
            };

            const cursedItemObj = GameObject.fromJSON(cursedItem);
            character.inventory.push({
                id: 'cursed-item',
                quantity: 1,
                objectData: cursedItemObj
            });
            const objectsMap = { 'cursed-item': cursedItemObj };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            expect(currentStats.strength).toBe(2); // 5 base - 3
            expect(currentStats.health).toBe(8); // 10 base - 2
        });

        it('should handle partial stat blocks (only some stats modified)', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the item (via carryEffects)
            const character = createTestCharacterState('test', 'Test', undefined, [
                createTestEffect('item-perception', 'game', undefined, { perception: 3 })
            ]);
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: []
            };

            const itemObj = GameObject.fromJSON(item);
            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: itemObj
            });
            const objectsMap = { item: itemObj };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            expect(currentStats.perception).toBe(5); // 2 base + 3
            expect(currentStats.health).toBe(10); // Unchanged
            expect(currentStats.strength).toBe(5); // Unchanged
        });

        it('should apply modifiers in correct order (base → effects)', () => {
            const calculator = createTestStatCalculator();
            // Add effects that would be applied when carrying the item (via carryEffects) and a separate effect
            const character = createTestCharacterState('test', 'Test', {
                perception: 5
            }, [
                createTestEffect('item-perception', 'game', undefined, { perception: 2 }),
                createTestEffect('other-effect', 'game', undefined, { perception: -1 })
            ]);
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: []
            };

            const itemObj = GameObject.fromJSON(item);
            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: itemObj
            });
            const objectsMap = { item: itemObj };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            // Base (5) + effect1 (2) + effect2 (-1) = 6
            expect(currentStats.perception).toBe(6);
        });

        it('should handle effects from nested objects in containers', () => {
            const calculator = createTestStatCalculator();
            // Add effects that would be applied when carrying the container and nested item (via carryEffects)
            const character = createTestCharacterState('test', 'Test', undefined, [
                createTestEffect('backpack-strength', 'game', undefined, { strength: 2 }),
                createTestEffect('nested-item-strength', 'game', undefined, { strength: 1 })
            ]);
            
            const nestedItem: ObjectDefinition = {
                id: 'nested-item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'Nested item',
                traits: []
            };

            const container: ObjectDefinition = {
                id: 'backpack',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                contains: [nestedItem]
            };

            const containerObj = GameObject.fromJSON(container);
            const nestedItemObj = GameObject.fromJSON(nestedItem);
            character.inventory.push({
                id: 'backpack',
                quantity: 1,
                objectData: containerObj
            });
            const objectsMap = { backpack: containerObj, 'nested-item': nestedItemObj };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            // Base (5) + container effect (2) + nested effect (1) = 8
            expect(currentStats.strength).toBe(8);
        });
    });

    describe('getEffectiveStat', () => {
        it('should return correct stat value for each stat type', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test', {
                health: 15,
                willpower: 8,
                perception: 4,
                reputation: 2,
                strength: 7,
                agility: 6
            });

            expect(calculator.getEffectiveStat(character, 'health', {})).toBe(15);
            expect(calculator.getEffectiveStat(character, 'willpower', {})).toBe(8);
            expect(calculator.getEffectiveStat(character, 'perception', {})).toBe(4);
            expect(calculator.getEffectiveStat(character, 'reputation', {})).toBe(2);
            expect(calculator.getEffectiveStat(character, 'strength', {})).toBe(7);
            expect(calculator.getEffectiveStat(character, 'agility', {})).toBe(6);
        });

        it('should use current calculated stats, not base stats', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the item (via carryEffects)
            const character = createTestCharacterState('test', 'Test', {
                strength: 5
            }, [
                createTestEffect('item-strength', 'game', undefined, { strength: 3 })
            ]);
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: []
            };

            const itemObj = GameObject.fromJSON(item);
            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: itemObj
            });
            const objectsMap = { item: itemObj };

            const effectiveStrength = calculator.getEffectiveStat(character, 'strength', objectsMap);

            expect(effectiveStrength).toBe(8); // 5 base + 3 from effect
            expect(character.baseStats.strength).toBe(5); // Base unchanged
        });
    });

    describe('updateCharacterStats', () => {
        it('should update character.stats with calculated values', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the item (via carryEffects)
            const character = createTestCharacterState('test', 'Test', {
                strength: 5
            }, [
                createTestEffect('item-strength', 'game', undefined, { strength: 2 })
            ]);
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: []
            };

            const itemObj = GameObject.fromJSON(item);
            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: itemObj
            });
            const objectsMap = { item: itemObj };

            const updated = calculator.updateCharacterStats(character, objectsMap);

            expect(updated.stats.strength).toBe(7); // Updated
            expect(updated.baseStats.strength).toBe(5); // Base unchanged
        });

        it('should not modify baseStats', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test', {
                health: 10
            });

            const updated = calculator.updateCharacterStats(character, {});

            expect(updated.baseStats.health).toBe(10);
            expect(updated.stats.health).toBe(10);
        });

        it('should return new CharacterState (immutability)', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');

            const updated = calculator.updateCharacterStats(character, {});

            expect(updated).not.toBe(character);
            expect(updated.stats).not.toBe(character.stats);
        });
    });

    describe('Edge cases', () => {
        it('should handle empty inventory', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');
            character.inventory = []; // Remove hand containers

            const currentStats = calculator.calculateCurrentStats(character, {});

            expect(currentStats.health).toBe(10);
        });

        it('should handle no active effects', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');
            character.effects = [];

            const currentStats = calculator.calculateCurrentStats(character, {});

            expect(currentStats).toEqual(character.baseStats);
        });

        it('should handle objects without stat modifiers (no effects)', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: []
                // No carryEffects, so no stat modifiers
            };

            const itemObj = GameObject.fromJSON(item);
            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: itemObj
            });
            const objectsMap = { item: itemObj };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            expect(currentStats).toEqual(character.baseStats);
        });

        it('should handle effects without statModifiers', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');
            character.effects = [
                {
                    id: 'effect',
                    source: 'game'
                    // No statModifiers
                }
            ];

            const currentStats = calculator.calculateCurrentStats(character, {});

            expect(currentStats).toEqual(character.baseStats);
        });

        it('should handle very large modifier values', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the item (via carryEffects)
            const character = createTestCharacterState('test', 'Test', {
                health: 10
            }, [
                createTestEffect('item-health', 'game', undefined, { health: 1000 })
            ]);
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: []
            };

            const itemObj = GameObject.fromJSON(item);
            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: itemObj
            });
            const objectsMap = { item: itemObj };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            expect(currentStats.health).toBe(1010);
        });

        it('should allow negative stat values (for health)', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the item (via carryEffects)
            const character = createTestCharacterState('test', 'Test', {
                health: 5
            }, [
                createTestEffect('item-health-drain', 'game', undefined, { health: -10 })
            ]);
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: []
            };

            const itemObj = GameObject.fromJSON(item);
            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: itemObj
            });
            const objectsMap = { item: itemObj };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            expect(currentStats.health).toBe(-5); // Negative allowed
        });
    });
});

