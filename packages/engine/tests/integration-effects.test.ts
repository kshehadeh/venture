// @ts-ignore - bun:test is available at runtime
import { describe, it, expect } from 'bun:test';
import { CharacterState, GameState, ObjectDefinition } from '@/types';
import {
    createTestCharacterState,
    createTestGameStateWithEffects,
    createTestEffectManager,
    createTestStatCalculator,
    createTestEffect
} from './helpers/effect-test-helpers';

describe('Integration Tests - Effects System', () => {
    describe('Full Effect Lifecycle', () => {
        it('should apply effect → stat changes → tick effects → stat changes → remove effect → stat reverts', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', {
                perception: 5,
                health: 10
            });

            // Apply effect
            character = manager.applyEffect(character, 'blindness');
            let updated = calculator.updateCharacterStats(character, {});
            expect(updated.stats.perception).toBeLessThan(0); // Blindness applied

            // Tick effects (blindness is permanent, so no change)
            character = manager.tickEffects(character);
            updated = calculator.updateCharacterStats(character, {});
            expect(updated.stats.perception).toBeLessThan(0); // Still blind

            // Apply poison
            character = manager.applyEffect(character, 'poison', 3);
            character = manager.tickEffects(character); // Poison ticks
            updated = calculator.updateCharacterStats(character, {});
            expect(updated.baseStats.health).toBe(9); // Poison applied per-turn
            expect(updated.stats.health).toBe(9);

            // Remove blindness
            character = manager.removeEffect(character, 'blindness');
            updated = calculator.updateCharacterStats(character, {});
            expect(updated.stats.perception).toBe(5); // Restored
        });

        it('should stack multiple effects correctly', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', {
                perception: 5,
                willpower: 5
            });

            character = manager.applyEffect(character, 'blindness');
            character = manager.applyEffect(character, 'poison', 5);

            const updated = calculator.updateCharacterStats(character, {});

            expect(updated.stats.perception).toBeLessThan(0); // From blindness
            expect(updated.effects.length).toBe(2); // Both effects active
        });

        it('should compound per-turn effects over multiple turns', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', {
                health: 10
            });

            character = manager.applyEffect(character, 'poison', 3);

            // Tick 1
            character = manager.tickEffects(character);
            let updated = calculator.updateCharacterStats(character, {});
            expect(updated.baseStats.health).toBe(9); // 10 - 1

            // Tick 2
            character = manager.tickEffects(character);
            updated = calculator.updateCharacterStats(character, {});
            expect(updated.baseStats.health).toBe(8); // 9 - 1 (cumulative)

            // Tick 3
            character = manager.tickEffects(character);
            updated = calculator.updateCharacterStats(character, {});
            expect(updated.baseStats.health).toBe(7); // 8 - 1 (cumulative)
            expect(updated.effects.length).toBe(0); // Expired
        });

        it('should not compound static modifiers', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', {
                perception: 5
            });

            character = manager.applyEffect(character, 'blindness');

            // Tick multiple times
            for (let i = 0; i < 5; i++) {
                character = manager.tickEffects(character);
                const updated = calculator.updateCharacterStats(character, {});
                // Static modifier doesn't compound
                expect(updated.stats.perception).toBeLessThan(0);
            }
        });

        it('should expire effects after duration', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test');

            character = manager.applyEffect(character, 'poison', 2);

            expect(character.effects.length).toBe(1);

            // Tick once
            character = manager.tickEffects(character);
            expect(character.effects.length).toBe(1); // Still active

            // Tick again (duration becomes 0)
            character = manager.tickEffects(character);
            expect(character.effects.length).toBe(0); // Expired
        });

        it('should persist permanent effects until removed', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test');

            character = manager.applyEffect(character, 'blindness');

            // Tick many times
            for (let i = 0; i < 10; i++) {
                character = manager.tickEffects(character);
                expect(character.effects.length).toBe(1); // Still active
            }

            // Remove manually
            character = manager.removeEffect(character, 'blindness');
            expect(character.effects.length).toBe(0);
        });
    });

    describe('Object Stat Modifiers (via Effects)', () => {
        it('should increase stats when object with carryEffects is picked up', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the sword (via carryEffects)
            const character = createTestCharacterState('test', 'Test', {
                strength: 5
            }, [
                createTestEffect('sword-strength', 'game', undefined, { strength: 3 })
            ]);

            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            character.inventory.push({
                id: 'sword',
                quantity: 1,
                objectData: sword
            });
            const objectsMap = { sword };

            const updated = calculator.updateCharacterStats(character, objectsMap);

            expect(updated.stats.strength).toBe(8); // 5 + 3
        });

        it('should decrease stats when object is dropped (effect removed)', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the sword (via carryEffects)
            let character = createTestCharacterState('test', 'Test', {
                strength: 5
            }, [
                createTestEffect('sword-strength', 'game', undefined, { strength: 3 })
            ]);

            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            character.inventory.push({
                id: 'sword',
                quantity: 1,
                objectData: sword
            });
            let objectsMap: Record<string, ObjectDefinition> = { sword };
            let updated = calculator.updateCharacterStats(character, objectsMap);
            expect(updated.stats.strength).toBe(8);

            // Remove object and its effect (simulating drop command behavior)
            updated.inventory = updated.inventory.filter(e => e.id !== 'sword');
            updated.effects = updated.effects.filter(e => e.id !== 'sword-strength');
            objectsMap = {};
            updated = calculator.updateCharacterStats(updated, objectsMap);

            expect(updated.stats.strength).toBe(5); // Back to base
        });

        it('should stack multiple objects with modifiers (via effects)', () => {
            const calculator = createTestStatCalculator();
            // Add effects that would be applied when carrying the sword and shield (via carryEffects)
            const character = createTestCharacterState('test', 'Test', {
                strength: 5
            }, [
                createTestEffect('sword-strength', 'game', undefined, { strength: 2 }),
                createTestEffect('shield-strength', 'game', undefined, { strength: 1 })
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

            character.inventory.push(
                { id: 'sword', quantity: 1, objectData: sword },
                { id: 'shield', quantity: 1, objectData: shield }
            );
            const objectsMap = { sword, shield };

            const updated = calculator.updateCharacterStats(character, objectsMap);

            expect(updated.stats.strength).toBe(8); // 5 + 2 + 1
        });

        it('should apply modifiers from objects in containers (via effects)', () => {
            const calculator = createTestStatCalculator();
            // Add effects that would be applied when carrying the container and nested item (via carryEffects)
            const character = createTestCharacterState('test', 'Test', {
                strength: 5
            }, [
                createTestEffect('backpack-strength', 'game', undefined, { strength: 1 }),
                createTestEffect('nested-item-strength', 'game', undefined, { strength: 2 })
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

            character.inventory.push({
                id: 'backpack',
                quantity: 1,
                objectData: container
            });
            const objectsMap = { backpack: container, 'nested-item': nestedItem };

            const updated = calculator.updateCharacterStats(character, objectsMap);

            expect(updated.stats.strength).toBe(8); // 5 + 1 + 2
        });

        it('should stop applying modifiers when objects are removed from containers (effect removed)', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the nested item (via carryEffects)
            let character = createTestCharacterState('test', 'Test', {
                strength: 5
            }, [
                createTestEffect('nested-item-strength', 'game', undefined, { strength: 2 })
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

            character.inventory.push({
                id: 'backpack',
                quantity: 1,
                objectData: container
            });
            let objectsMap: Record<string, ObjectDefinition> = { backpack: container, 'nested-item': nestedItem };
            let updated = calculator.updateCharacterStats(character, objectsMap);
            expect(updated.stats.strength).toBe(7); // 5 + 2

            // Remove nested item and its effect (simulating removal)
            const updatedContainer = {
                ...container,
                contains: []
            };
            // Create new inventory array with updated container
            updated.inventory = updated.inventory.map(entry => 
                entry.id === 'backpack' 
                    ? { ...entry, objectData: updatedContainer }
                    : entry
            );
            updated.effects = updated.effects.filter(e => e.id !== 'nested-item-strength');
            objectsMap = { backpack: updatedContainer };
            updated = calculator.updateCharacterStats(updated, objectsMap);

            expect(updated.stats.strength).toBe(5); // Back to base
        });
    });

    describe('Effect + Object Interaction', () => {
        it('should combine object modifiers (via effects) and effect modifiers correctly', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            // Add effect that would be applied when carrying the sword (via carryEffects)
            let character = createTestCharacterState('test', 'Test', {
                strength: 5
            }, [
                createTestEffect('sword-strength', 'game', undefined, { strength: 2 })
            ]);

            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            character.inventory.push({
                id: 'sword',
                quantity: 1,
                objectData: sword
            });
            character = manager.applyEffect(character, 'blindness'); // Doesn't affect strength

            const objectsMap = { sword };
            const updated = calculator.updateCharacterStats(character, objectsMap);

            expect(updated.stats.strength).toBe(7); // 5 base + 2 from effect
        });

        it('should apply per-turn effects to base stats, then object modifiers (via effects) apply', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            // Add effect that would be applied when carrying the item (via carryEffects)
            let character = createTestCharacterState('test', 'Test', {
                health: 10
            }, [
                createTestEffect('item-health', 'game', undefined, { health: 5 })
            ]);

            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: []
            };

            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: item
            });
            character = manager.applyEffect(character, 'poison', 3);

            // Before tick
            let updated = calculator.updateCharacterStats(character, { item });
            expect(updated.stats.health).toBe(15); // 10 base + 5 from effect

            // After tick (poison reduces base)
            character = manager.tickEffects(character);
            updated = calculator.updateCharacterStats(character, { item });
            expect(updated.baseStats.health).toBe(9); // 10 - 1 (poison)
            expect(updated.stats.health).toBe(14); // 9 base + 5 from effect
        });

        it('should not affect effect modifiers when removing object (object effect removed)', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            // Add effect that would be applied when carrying the item (via carryEffects)
            let character = createTestCharacterState('test', 'Test', {
                perception: 5
            }, [
                createTestEffect('item-perception', 'game', undefined, { perception: 2 })
            ]);

            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: []
            };

            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: item
            });
            character = manager.applyEffect(character, 'blindness');

            let objectsMap: Record<string, ObjectDefinition> = { item };
            let updated = calculator.updateCharacterStats(character, objectsMap);
            expect(updated.stats.perception).toBeLessThan(0); // Blindness dominates

            // Remove object and its effect
            updated.inventory = updated.inventory.filter(e => e.id !== 'item');
            updated.effects = updated.effects.filter(e => e.id !== 'item-perception');
            objectsMap = {};
            updated = calculator.updateCharacterStats(updated, objectsMap);

            expect(updated.stats.perception).toBeLessThan(0); // Still blind
        });

        it('should not affect object modifiers (via effects) when removing other effect', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            // Add effect that would be applied when carrying the sword (via carryEffects)
            let character = createTestCharacterState('test', 'Test', {
                strength: 5
            }, [
                createTestEffect('sword-strength', 'game', undefined, { strength: 3 })
            ]);

            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            character.inventory.push({
                id: 'sword',
                quantity: 1,
                objectData: sword
            });
            character = manager.applyEffect(character, 'blindness'); // Doesn't affect strength

            let objectsMap = { sword };
            let updated = calculator.updateCharacterStats(character, objectsMap);
            expect(updated.stats.strength).toBe(8); // 5 + 3

            // Remove effect
            character = manager.removeEffect(character, 'blindness');
            updated = calculator.updateCharacterStats(character, objectsMap);

            expect(updated.stats.strength).toBe(8); // Still 5 + 3
        });
    });

    describe('Game State Updates', () => {
        it('should persist effects through save/load', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test');
            character = manager.applyEffect(character, 'poison', 5);
            character = manager.applyEffect(character, 'blindness');

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            // Simulate save/load by serializing and deserializing
            const serialized = JSON.stringify(state);
            const loaded: GameState = JSON.parse(serialized);

            // Revive Sets
            for (const charId in loaded.characters) {
                const char = loaded.characters[charId];
                if (Array.isArray(char.traits)) {
                    char.traits = new Set(char.traits);
                }
                if (Array.isArray(char.flags)) {
                    char.flags = new Set(char.flags);
                }
            }
            if (Array.isArray(loaded.world.globalFlags)) {
                loaded.world.globalFlags = new Set(loaded.world.globalFlags);
            }
            if (Array.isArray(loaded.world.visitedScenes)) {
                loaded.world.visitedScenes = new Set(loaded.world.visitedScenes);
            }

            expect(loaded.characters.player.effects.length).toBe(2);
            expect(loaded.characters.player.effects[0].id).toBe('poison');
            expect(loaded.characters.player.effects[1].id).toBe('blindness');
        });

        it('should tick effects correctly after load', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', {
                health: 10
            });
            character = manager.applyEffect(character, 'poison', 3);

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            // Simulate load
            const loaded = { ...state };
            loaded.characters = { ...state.characters };
            loaded.characters.player = new CharacterState({ ...state.characters.player });

            // Tick after load
            loaded.characters.player = manager.tickEffects(loaded.characters.player);

            expect(loaded.characters.player.baseStats.health).toBe(9); // Poison applied
            expect(loaded.characters.player.effects[0].duration).toBe(2);
        });

        it('should preserve base stats through save/load', () => {
            const character = createTestCharacterState('test', 'Test', {
                health: 10,
                strength: 5
            });

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            const serialized = JSON.stringify(state);
            const loaded: GameState = JSON.parse(serialized);

            // Revive Sets
            for (const charId in loaded.characters) {
                const char = loaded.characters[charId];
                if (Array.isArray(char.traits)) {
                    char.traits = new Set(char.traits);
                }
                if (Array.isArray(char.flags)) {
                    char.flags = new Set(char.flags);
                }
            }
            if (Array.isArray(loaded.world.globalFlags)) {
                loaded.world.globalFlags = new Set(loaded.world.globalFlags);
            }
            if (Array.isArray(loaded.world.visitedScenes)) {
                loaded.world.visitedScenes = new Set(loaded.world.visitedScenes);
            }

            expect(loaded.characters.player.baseStats.health).toBe(10);
            expect(loaded.characters.player.baseStats.strength).toBe(5);
        });

        it('should recalculate current stats after load', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the sword (via carryEffects)
            const character = createTestCharacterState('test', 'Test', {
                strength: 5
            }, [
                createTestEffect('sword-strength', 'game', undefined, { strength: 3 })
            ]);

            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            character.inventory.push({
                id: 'sword',
                quantity: 1,
                objectData: sword
            });

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            // Simulate load
            const loaded = { ...state };
            const objectsMap = { sword };

            // Recalculate after load
            loaded.characters.player = calculator.updateCharacterStats(loaded.characters.player, objectsMap);

            expect(loaded.characters.player.stats.strength).toBe(8); // 5 + 3
        });
    });

    describe('Edge Cases', () => {
        it('should handle character with no inventory and no effects', () => {
            const calculator = createTestStatCalculator();
            const character = createTestCharacterState('test', 'Test');
            character.inventory = []; // Remove hand containers

            const currentStats = calculator.calculateCurrentStats(character, {});

            expect(currentStats.health).toBe(10);
            expect(currentStats).toEqual(character.baseStats);
        });

        it('should allow health to go negative with poison effect', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', {
                health: 2
            });

            character = manager.applyEffect(character, 'poison', 5);

            // Tick multiple times
            for (let i = 0; i < 5; i++) {
                character = manager.tickEffects(character);
            }

            expect(character.baseStats.health).toBe(-3); // 2 - 5
            const updated = calculator.updateCharacterStats(character, {});
            expect(updated.stats.health).toBe(-3);
        });

        it('should handle multiple overlapping effects', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', {
                perception: 5
            });

            character = manager.applyEffect(character, 'blindness');
            character = manager.applyEffect(character, 'blindness'); // Duplicate

            const updated = calculator.updateCharacterStats(character, {});

            expect(updated.effects.length).toBe(2);
            expect(updated.stats.perception).toBeLessThan(0);
        });

        it('should handle effect that modifies same stat as object (via effects)', () => {
            const calculator = createTestStatCalculator();            
            // Add effect that would be applied when carrying the item (via carryEffects)
            let character = createTestCharacterState('test', 'Test', {
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

            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: item
            });

            // Apply effect that also modifies strength (hypothetical)
            const gameDefs = {
                'strength-boost': {
                    id: 'strength-boost',
                    name: 'Strength Boost',
                    description: 'Boosted strength',
                    statModifiers: { strength: 1 }
                }
            };
            const customManager = createTestEffectManager(gameDefs);
            character = customManager.applyEffect(character, 'strength-boost');

            const objectsMap = { item };
            const updated = calculator.updateCharacterStats(character, objectsMap);

            expect(updated.stats.strength).toBe(8); // 5 base + 2 from item effect + 1 from strength-boost effect
        });

        it('should handle removing effect that was never applied', () => {
            const manager = createTestEffectManager();
            const character = createTestCharacterState('test', 'Test');

            const updated = manager.removeEffect(character, 'non-existent');

            expect(updated).toBe(character); // Unchanged
            expect(updated.effects.length).toBe(0);
        });

        it('should handle applying effect with invalid ID', () => {
            const manager = createTestEffectManager();
            const character = createTestCharacterState('test', 'Test');

            expect(() => {
                manager.applyEffect(character, 'invalid-effect-id');
            }).toThrow('Unknown effect ID: invalid-effect-id');
        });

        it('should handle effect with very long duration', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test');

            character = manager.applyEffect(character, 'poison', 1000);

            // Tick many times
            for (let i = 0; i < 100; i++) {
                character = manager.tickEffects(character);
            }

            expect(character.effects.length).toBe(1);
            expect(character.effects[0].duration).toBe(900);
        });

        it('should handle effect that expires immediately (duration 1, then tick)', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', {
                health: 10
            });

            character = manager.applyEffect(character, 'poison', 1);

            // Before tick
            expect(character.effects.length).toBe(1);
            expect(character.effects[0].duration).toBe(1);

            // Tick (should expire)
            character = manager.tickEffects(character);
            const updated = calculator.updateCharacterStats(character, {});

            expect(character.effects.length).toBe(0); // Expired
            expect(updated.baseStats.health).toBe(9); // Per-turn modifier was applied before removal
        });
    });
});

