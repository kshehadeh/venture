// @ts-ignore - bun:test is available at runtime
import { describe, it, expect } from 'bun:test';
import { ObjectDefinition } from '@/types';
import {
    createTestCharacterState,
    createTestGameStateWithEffects,
    createTestEffectManager,
    createTestStatCalculator,
    createTestEffect
} from './helpers/effect-test-helpers';

describe('CharacterState', () => {
    describe('Structure', () => {
        it('should have baseStats that are immutable (stored separately)', () => {
            const character = createTestCharacterState('test', 'Test', {
                health: 10,
                strength: 5
            });

            expect(character.baseStats.health).toBe(10);
            expect(character.baseStats.strength).toBe(5);
            expect(character.baseStats).not.toBe(character.stats);
        });

        it('should have current stats that are calculated (not stored in base)', () => {
            const character = createTestCharacterState('test', 'Test', {
                health: 10
            });

            // Initially they match
            expect(character.stats.health).toBe(10);
            expect(character.baseStats.health).toBe(10);
        });

        it('should have effects array that stores active effects', () => {
            const character = createTestCharacterState('test', 'Test');
            character.effects = [
                {
                    id: 'poison',
                    source: 'builtin',
                    duration: 5,
                    perTurnModifiers: { health: -1 }
                }
            ];

            expect(character.effects.length).toBe(1);
            expect(character.effects[0].id).toBe('poison');
        });

        it('should support multiple characters independently', () => {
            const player = createTestCharacterState('player', 'Player', { health: 10 });
            const npc = createTestCharacterState('npc1', 'NPC', { health: 15 });

            expect(player.baseStats.health).toBe(10);
            expect(npc.baseStats.health).toBe(15);
            expect(player.id).not.toBe(npc.id);
        });

        it('should have unique character IDs', () => {
            const char1 = createTestCharacterState('char1', 'Character 1');
            const char2 = createTestCharacterState('char2', 'Character 2');

            expect(char1.id).toBe('char1');
            expect(char2.id).toBe('char2');
            expect(char1.id).not.toBe(char2.id);
        });
    });

    describe('Stat Calculation Integration', () => {
        it('should keep base stats unchanged when objects/effects change', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the item (via carryEffects)
            const character = createTestCharacterState('test', 'Test', { health: 10 }, [
                createTestEffect('item-health', 'game', undefined, { health: 5 })
            ]);
            const originalBaseHealth = character.baseStats.health;

            const item: ObjectDefinition = {
                id: 'item',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'An item',
                traits: [],                
            };

            character.inventory.push({
                id: 'item',
                quantity: 1,
                objectData: item
            });
            const objectsMap = { item };

            const updated = calculator.updateCharacterStats(character, objectsMap);

            expect(updated.baseStats.health).toBe(originalBaseHealth); // Unchanged
            expect(updated.stats.health).toBe(15); // Updated (10 base + 5 from effect)
        });

        it('should update current stats when objects are picked up', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the sword (via carryEffects)
            const character = createTestCharacterState('test', 'Test', { strength: 5 }, [
                createTestEffect('sword-strength', 'game', undefined, { strength: 3 })
            ]);
            const originalStrength = character.stats.strength;

            const item: ObjectDefinition = {
                id: 'sword',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: [],
            };

            character.inventory.push({
                id: 'sword',
                quantity: 1,
                objectData: item
            });
            const objectsMap = { sword: item };

            const updated = calculator.updateCharacterStats(character, objectsMap);

            expect(updated.stats.strength).toBe(8); // 5 + 3
            expect(updated.stats.strength).not.toBe(originalStrength);
        });

        it('should update current stats when objects are dropped', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when carrying the sword (via carryEffects)
            let character = createTestCharacterState('test', 'Test', { strength: 5 }, [
                createTestEffect('sword-strength', 'game', undefined, { strength: 3 })
            ]);

            const item: ObjectDefinition = {
                id: 'sword',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: [],
            };

            character.inventory.push({
                id: 'sword',
                quantity: 1,
                objectData: item
            });
            const objectsMapWithItem = { sword: item };
            let updated = calculator.updateCharacterStats(character, objectsMapWithItem);
            expect(updated.stats.strength).toBe(8);

            // Remove item and its effect (simulating drop command behavior)
            updated.inventory = updated.inventory.filter(e => e.id !== 'sword');
            updated.effects = updated.effects.filter(e => e.id !== 'sword-strength');
            const objectsMapEmpty = {};
            updated = calculator.updateCharacterStats(updated, objectsMapEmpty);

            expect(updated.stats.strength).toBe(5); // Back to base
        });

        it('should update current stats when effects are applied', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', { perception: 5 });

            character = manager.applyEffect(character, 'blindness');
            const objectsMap = {};
            const updated = calculator.updateCharacterStats(character, objectsMap);

            expect(updated.stats.perception).toBeLessThan(0); // Blindness sets to effectively 0
        });

        it('should update current stats when effects are removed', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', { perception: 5 });

            character = manager.applyEffect(character, 'blindness');
            let updated = calculator.updateCharacterStats(character, {});
            expect(updated.stats.perception).toBeLessThan(0);

            character = manager.removeEffect(character, 'blindness');
            updated = calculator.updateCharacterStats(character, {});

            expect(updated.stats.perception).toBe(5); // Restored
        });

        it('should update current stats when effects tick', () => {
            const calculator = createTestStatCalculator();
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', { health: 10 });

            character = manager.applyEffect(character, 'poison', 3);
            character = manager.tickEffects(character); // Applies per-turn modifier to baseStats
            const updated = calculator.updateCharacterStats(character, {});

            expect(updated.baseStats.health).toBe(9); // Per-turn modifier applied
            expect(updated.stats.health).toBe(9); // Current stats reflect base change
        });
    });

    describe('Multiple Characters', () => {
        it('should have independent baseStats for each character', () => {
            const state = createTestGameStateWithEffects('test-scene', {
                player: createTestCharacterState('player', 'Player', { health: 10 }),
                npc1: createTestCharacterState('npc1', 'NPC 1', { health: 15 })
            });

            expect(state.characters.player.baseStats.health).toBe(10);
            expect(state.characters.npc1.baseStats.health).toBe(15);
        });

        it('should have independent effects for each character', () => {
            const manager = createTestEffectManager();
            const player = createTestCharacterState('player', 'Player');
            const npc = createTestCharacterState('npc1', 'NPC');

            const playerWithEffect = manager.applyEffect(player, 'poison');
            const npcWithEffect = manager.applyEffect(npc, 'blindness');

            expect(playerWithEffect.effects.length).toBe(1);
            expect(playerWithEffect.effects[0].id).toBe('poison');
            expect(npcWithEffect.effects.length).toBe(1);
            expect(npcWithEffect.effects[0].id).toBe('blindness');
        });

        it('should calculate stats for each character separately', () => {
            const calculator = createTestStatCalculator();
            // Add effect that would be applied when player carries the sword (via carryEffects)
            const player = createTestCharacterState('player', 'Player', { strength: 5 }, [
                createTestEffect('sword-strength', 'game', undefined, { strength: 3 })
            ]);
            const npc = createTestCharacterState('npc1', 'NPC', { strength: 10 });

            const playerItem: ObjectDefinition = {
                id: 'sword',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: [],
            };

            player.inventory.push({
                id: 'sword',
                quantity: 1,
                objectData: playerItem
            });

            const playerObjects = { sword: playerItem };
            const npcObjects = {};

            const updatedPlayer = calculator.updateCharacterStats(player, playerObjects);
            const updatedNpc = calculator.updateCharacterStats(npc, npcObjects);

            expect(updatedPlayer.stats.strength).toBe(8); // 5 + 3
            expect(updatedNpc.stats.strength).toBe(10); // Unchanged
        });

        it('should allow effects to be applied to different characters independently', () => {
            const manager = createTestEffectManager();
            const player = createTestCharacterState('player', 'Player');
            const npc = createTestCharacterState('npc1', 'NPC');

            const playerWithPoison = manager.applyEffect(player, 'poison', 5);
            const npcWithBlindness = manager.applyEffect(npc, 'blindness');

            expect(playerWithPoison.effects[0].id).toBe('poison');
            expect(npcWithBlindness.effects[0].id).toBe('blindness');
            expect(playerWithPoison.effects.length).toBe(1);
            expect(npcWithBlindness.effects.length).toBe(1);
        });
    });
});

