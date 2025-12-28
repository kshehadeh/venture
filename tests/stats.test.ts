// @ts-ignore - bun:test is available at runtime
import { describe, it, expect } from 'bun:test';
import { StatCalculator } from '../src/core/stats';
import { CharacterState, ObjectDefinition, InventoryEntry } from '../src/core/types';
import { createTestCharacterState, createTestStatCalculator } from './helpers/effect-test-helpers';
import { createHandContainers } from '../src/core/container';

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

        it('should apply object stat modifiers correctly', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');
            
            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: [],
                statModifiers: { strength: 2, agility: 1 }
            };

            const inventoryEntry: InventoryEntry = {
                id: 'sword',
                quantity: 1,
                objectData: sword
            };

            character.inventory.push(inventoryEntry);
            const objectsMap = { sword };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            expect(currentStats.strength).toBe(7); // 5 base + 2 from sword
            expect(currentStats.agility).toBe(6); // 5 base + 1 from sword
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

        it('should combine multiple object modifiers (additive)', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');
            
            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: [],
                statModifiers: { strength: 2 }
            };

            const shield: ObjectDefinition = {
                id: 'shield',
                weight: 3,
                perception: 0,
                removable: true,
                description: 'A shield',
                traits: [],
                statModifiers: { strength: 1, health: 5 }
            };

            character.inventory.push(
                { id: 'sword', quantity: 1, objectData: sword },
                { id: 'shield', quantity: 1, objectData: shield }
            );
            const objectsMap = { sword, shield };

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
            const character = createTestCharacterState('test', 'Test', {
                health: 10,
                strength: 5
            });
            
            const cursedItem: ObjectDefinition = {
                id: 'cursed-item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A cursed item',
                traits: [],
                statModifiers: { strength: -3, health: -2 }
            };

            character.inventory.push({
                id: 'cursed-item',
                quantity: 1,
                objectData: cursedItem
            });
            const objectsMap = { 'cursed-item': cursedItem };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            expect(currentStats.strength).toBe(2); // 5 base - 3
            expect(currentStats.health).toBe(8); // 10 base - 2
        });

        it('should handle partial stat blocks (only some stats modified)', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: [],
                statModifiers: { perception: 3 } // Only perception modified
            };

            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: item
            });
            const objectsMap = { item };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            expect(currentStats.perception).toBe(5); // 2 base + 3
            expect(currentStats.health).toBe(10); // Unchanged
            expect(currentStats.strength).toBe(5); // Unchanged
        });

        it('should apply modifiers in correct order (base → objects → effects)', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test', {
                perception: 5
            });
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: [],
                statModifiers: { perception: 2 }
            };

            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: item
            });
            character.effects = [
                {
                    id: 'effect',
                    source: 'game',
                    statModifiers: { perception: -1 }
                }
            ];
            const objectsMap = { item };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            // Base (5) + object (2) + effect (-1) = 6
            expect(currentStats.perception).toBe(6);
        });

        it('should handle nested objects in containers', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');
            
            const nestedItem: ObjectDefinition = {
                id: 'nested-item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'Nested item',
                traits: [],
                statModifiers: { strength: 1 }
            };

            const container: ObjectDefinition = {
                id: 'backpack',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                statModifiers: { strength: 2 },
                contains: [nestedItem]
            };

            character.inventory.push({
                id: 'backpack',
                quantity: 1,
                objectData: container
            });
            const objectsMap = { backpack: container, 'nested-item': nestedItem };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            // Base (5) + container (2) + nested (1) = 8
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
            const character = createTestCharacterState('test', 'Test', {
                strength: 5
            });
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: [],
                statModifiers: { strength: 3 }
            };

            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: item
            });
            const objectsMap = { item };

            const effectiveStrength = calculator.getEffectiveStat(character, 'strength', objectsMap);

            expect(effectiveStrength).toBe(8); // 5 base + 3 modifier
            expect(character.baseStats.strength).toBe(5); // Base unchanged
        });
    });

    describe('updateCharacterStats', () => {
        it('should update character.stats with calculated values', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test', {
                strength: 5
            });
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: [],
                statModifiers: { strength: 2 }
            };

            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: item
            });
            const objectsMap = { item };

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

        it('should handle objects without statModifiers', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: []
                // No statModifiers
            };

            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: item
            });
            const objectsMap = { item };

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
            const character = createTestCharacterState('test', 'Test', {
                health: 10
            });
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: [],
                statModifiers: { health: 1000 }
            };

            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: item
            });
            const objectsMap = { item };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            expect(currentStats.health).toBe(1010);
        });

        it('should allow negative stat values (for health)', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test', {
                health: 5
            });
            
            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: [],
                statModifiers: { health: -10 }
            };

            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: item
            });
            const objectsMap = { item };

            const currentStats = calculator.calculateCurrentStats(character, objectsMap);

            expect(currentStats.health).toBe(-5); // Negative allowed
        });
    });
});

