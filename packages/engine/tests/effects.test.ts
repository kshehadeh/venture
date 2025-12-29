// @ts-ignore - bun:test is available at runtime
import { describe, it, expect } from 'bun:test';
import { Effect } from '@/effects';
import { CharacterEffect, EffectDefinition } from '@/types';
import { createTestCharacterState, createTestEffect, createTestEffectDefinition, createTestEffectManager } from './helpers/effect-test-helpers';

describe('Effect', () => {
    describe('Constructor', () => {
        it('should create effect from definition correctly', () => {
            const definition: EffectDefinition = {
                id: 'test-effect',
                name: 'Test Effect',
                description: 'A test effect',
                statModifiers: { health: 5 },
                perTurnModifiers: { health: -1 },
                duration: 10,
                builtin: false
            };

            const effect = new Effect(definition);

            expect(effect.id).toBe('test-effect');
            expect(effect.source).toBe('game');
            expect(effect.duration).toBe(10);
            expect(effect.statModifiers).toEqual({ health: 5 });
            expect(effect.perTurnModifiers).toEqual({ health: -1 });
        });

        it('should set duration from parameter if provided', () => {
            const definition: EffectDefinition = {
                id: 'test-effect',
                name: 'Test Effect',
                description: 'A test effect',
                duration: 5
            };

            const effect = new Effect(definition, 10);

            expect(effect.duration).toBe(10); // Parameter overrides definition
        });

        it('should set duration from definition if parameter not provided', () => {
            const definition: EffectDefinition = {
                id: 'test-effect',
                name: 'Test Effect',
                description: 'A test effect',
                duration: 5
            };

            const effect = new Effect(definition);

            expect(effect.duration).toBe(5);
        });

        it('should copy statModifiers and perTurnModifiers', () => {
            const definition: EffectDefinition = {
                id: 'test-effect',
                name: 'Test Effect',
                description: 'A test effect',
                statModifiers: { health: 5 }
            };

            const effect = new Effect(definition);

            expect(effect.statModifiers).toEqual({ health: 5 });
            expect(effect.statModifiers).not.toBe(definition.statModifiers); // Different object
        });

        it('should handle metadata', () => {
            const definition: EffectDefinition = {
                id: 'test-effect',
                name: 'Test Effect',
                description: 'A test effect'
            };

            const effect = new Effect(definition);

            expect(effect.metadata).toEqual({});
        });

        it('should set source to builtin for built-in effects', () => {
            const definition: EffectDefinition = {
                id: 'blindness',
                name: 'Blindness',
                description: 'Blind',
                builtin: true
            };

            const effect = new Effect(definition);

            expect(effect.source).toBe('builtin');
        });
    });

    describe('applyPerTurnModifiers', () => {
        it('should apply per-turn modifiers to base stats', () => {
            const definition: EffectDefinition = {
                id: 'poison',
                name: 'Poison',
                description: 'Poisoned',
                perTurnModifiers: { health: -1 }
            };

            const effect = new Effect(definition);
            const baseStats = { health: 10, willpower: 5, perception: 2, reputation: 0, strength: 5, agility: 5 };

            const result = effect.applyPerTurnModifiers(baseStats);

            expect(result.health).toBe(9); // 10 - 1
            expect(result.willpower).toBe(5); // Unchanged
        });

        it('should handle multiple stat modifiers', () => {
            const definition: EffectDefinition = {
                id: 'effect',
                name: 'Effect',
                description: 'An effect',
                perTurnModifiers: { health: -2, willpower: 1 }
            };

            const effect = new Effect(definition);
            const baseStats = { health: 10, willpower: 5, perception: 2, reputation: 0, strength: 5, agility: 5 };

            const result = effect.applyPerTurnModifiers(baseStats);

            expect(result.health).toBe(8); // 10 - 2
            expect(result.willpower).toBe(6); // 5 + 1
        });

        it('should handle negative modifiers', () => {
            const definition: EffectDefinition = {
                id: 'effect',
                name: 'Effect',
                description: 'An effect',
                perTurnModifiers: { health: -5 }
            };

            const effect = new Effect(definition);
            const baseStats = { health: 10, willpower: 5, perception: 2, reputation: 0, strength: 5, agility: 5 };

            const result = effect.applyPerTurnModifiers(baseStats);

            expect(result.health).toBe(5); // 10 - 5
        });

        it('should return new StatBlock (immutability)', () => {
            const definition: EffectDefinition = {
                id: 'effect',
                name: 'Effect',
                description: 'An effect',
                perTurnModifiers: { health: -1 }
            };

            const effect = new Effect(definition);
            const baseStats = { health: 10, willpower: 5, perception: 2, reputation: 0, strength: 5, agility: 5 };

            const result = effect.applyPerTurnModifiers(baseStats);

            expect(result).not.toBe(baseStats);
        });

        it('should return unchanged stats if no perTurnModifiers', () => {
            const definition: EffectDefinition = {
                id: 'effect',
                name: 'Effect',
                description: 'An effect'
            };

            const effect = new Effect(definition);
            const baseStats = { health: 10, willpower: 5, perception: 2, reputation: 0, strength: 5, agility: 5 };

            const result = effect.applyPerTurnModifiers(baseStats);

            expect(result).toEqual(baseStats);
        });
    });

    describe('shouldRemove', () => {
        it('should return false for permanent effects (no duration)', () => {
            const definition: EffectDefinition = {
                id: 'effect',
                name: 'Effect',
                description: 'An effect'
            };

            const effect = new Effect(definition);

            expect(effect.shouldRemove()).toBe(false);
        });

        it('should return false when duration > 0', () => {
            const definition: EffectDefinition = {
                id: 'effect',
                name: 'Effect',
                description: 'An effect',
                duration: 5
            };

            const effect = new Effect(definition);

            expect(effect.shouldRemove()).toBe(false);
        });

        it('should return true when duration === 0', () => {
            const definition: EffectDefinition = {
                id: 'effect',
                name: 'Effect',
                description: 'An effect',
                duration: 0
            };

            const effect = new Effect(definition);

            expect(effect.shouldRemove()).toBe(true);
        });

        it('should return true when duration < 0 (safety check)', () => {
            const definition: EffectDefinition = {
                id: 'effect',
                name: 'Effect',
                description: 'An effect',
                duration: -1
            };

            const effect = new Effect(definition);

            expect(effect.shouldRemove()).toBe(true);
        });
    });

    describe('tick', () => {
        it('should decrement duration by 1', () => {
            const definition: EffectDefinition = {
                id: 'effect',
                name: 'Effect',
                description: 'An effect',
                duration: 5
            };

            const effect = new Effect(definition);
            const ticked = effect.tick();

            expect(ticked.duration).toBe(4);
        });

        it('should return new Effect instance (immutability)', () => {
            const definition: EffectDefinition = {
                id: 'effect',
                name: 'Effect',
                description: 'An effect',
                duration: 5
            };

            const effect = new Effect(definition);
            const ticked = effect.tick();

            expect(ticked).not.toBe(effect);
            expect(effect.duration).toBe(5); // Original unchanged
        });

        it('should not modify duration if undefined (permanent)', () => {
            const definition: EffectDefinition = {
                id: 'effect',
                name: 'Effect',
                description: 'An effect'
            };

            const effect = new Effect(definition);
            const ticked = effect.tick();

            expect(ticked.duration).toBeUndefined();
            expect(ticked).toBe(effect); // Same instance for permanent effects
        });
    });
});

describe('EffectManager', () => {
    describe('Constructor', () => {
        it('should initialize built-in effects', () => {
            const manager = createTestEffectManager();

            const blindness = manager.getBuiltinEffectDefinition('blindness');
            expect(blindness).toBeDefined();
            expect(blindness?.id).toBe('blindness');

            const poison = manager.getBuiltinEffectDefinition('poison');
            expect(poison).toBeDefined();
            expect(poison?.id).toBe('poison');
        });

        it('should load game-specific effect definitions', () => {
            const gameDefs = {
                'custom-effect': createTestEffectDefinition('custom-effect', 'Custom', 'A custom effect')
            };

            const manager = createTestEffectManager(gameDefs);

            const custom = manager.getEffectDefinition('custom-effect');
            expect(custom).toBeDefined();
            expect(custom?.id).toBe('custom-effect');
        });

        it('should handle empty game definitions', () => {
            const manager = createTestEffectManager({});

            const blindness = manager.getBuiltinEffectDefinition('blindness');
            expect(blindness).toBeDefined();
        });
    });

    describe('applyEffect', () => {
        it('should add effect to character\'s effects array', () => {
            const manager = createTestEffectManager();
            const character = createTestCharacterState();

            const updated = manager.applyEffect(character, 'poison', 5);

            expect(updated.effects.length).toBe(1);
            expect(updated.effects[0].id).toBe('poison');
            expect(updated.effects[0].duration).toBe(5);
        });

        it('should look up effect definition (built-in or game-specific)', () => {
            const gameDefs = {
                'custom': createTestEffectDefinition('custom', 'Custom', 'Custom effect', { health: 5 })
            };
            const manager = createTestEffectManager(gameDefs);
            const character = createTestCharacterState();

            const updated = manager.applyEffect(character, 'custom');

            expect(updated.effects[0].statModifiers).toEqual({ health: 5 });
        });

        it('should create effect with correct statModifiers and perTurnModifiers', () => {
            const gameDefs = {
                'test': createTestEffectDefinition(
                    'test',
                    'Test',
                    'Test effect',
                    { health: 5 },
                    { health: -1 },
                    10
                )
            };
            const manager = createTestEffectManager(gameDefs);
            const character = createTestCharacterState();

            const updated = manager.applyEffect(character, 'test');

            expect(updated.effects[0].statModifiers).toEqual({ health: 5 });
            expect(updated.effects[0].perTurnModifiers).toEqual({ health: -1 });
            expect(updated.effects[0].duration).toBe(10);
        });

        it('should set duration from parameter or definition', () => {
            const gameDefs = {
                'test': createTestEffectDefinition('test', 'Test', 'Test effect', undefined, undefined, 5)
            };
            const manager = createTestEffectManager(gameDefs);
            const character = createTestCharacterState();

            const updated1 = manager.applyEffect(character, 'test');
            expect(updated1.effects[0].duration).toBe(5); // From definition

            const updated2 = manager.applyEffect(character, 'test', 10);
            expect(updated2.effects[0].duration).toBe(10); // From parameter
        });

        it('should return new CharacterState (immutability)', () => {
            const manager = createTestEffectManager();
            const character = createTestCharacterState();

            const updated = manager.applyEffect(character, 'poison');

            expect(updated).not.toBe(character);
            expect(updated.effects).not.toBe(character.effects);
        });

        it('should allow duplicate effects (stacking)', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();

            character = manager.applyEffect(character, 'poison', 5);
            character = manager.applyEffect(character, 'poison', 3);

            expect(character.effects.length).toBe(2);
            expect(character.effects[0].duration).toBe(5);
            expect(character.effects[1].duration).toBe(3);
        });

        it('should throw error for unknown effect ID', () => {
            const manager = createTestEffectManager();
            const character = createTestCharacterState();

            expect(() => {
                manager.applyEffect(character, 'unknown-effect');
            }).toThrow('Unknown effect ID: unknown-effect');
        });
    });

    describe('removeEffect', () => {
        it('should remove effect by ID from character', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'poison');
            character = manager.applyEffect(character, 'blindness');

            const updated = manager.removeEffect(character, 'poison');

            expect(updated.effects.length).toBe(1);
            expect(updated.effects[0].id).toBe('blindness');
        });

        it('should return new CharacterState (immutability)', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'poison');

            const updated = manager.removeEffect(character, 'poison');

            expect(updated).not.toBe(character);
        });

        it('should handle removing non-existent effect gracefully', () => {
            const manager = createTestEffectManager();
            const character = createTestCharacterState();

            const updated = manager.removeEffect(character, 'non-existent');

            expect(updated).toBe(character); // Unchanged
            expect(updated.effects.length).toBe(0);
        });

        it('should remove only first occurrence if duplicates exist', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'poison', 5);
            character = manager.applyEffect(character, 'poison', 3);

            const updated = manager.removeEffect(character, 'poison');

            expect(updated.effects.length).toBe(1);
            expect(updated.effects[0].duration).toBe(3); // Second one remains
        });
    });

    describe('tickEffects', () => {
        it('should decrement duration of all temporary effects', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'poison', 5);
            character = manager.applyEffect(character, 'blindness'); // Permanent

            const updated = manager.tickEffects(character);

            expect(updated.effects.find(e => e.id === 'poison')?.duration).toBe(4);
            expect(updated.effects.find(e => e.id === 'blindness')?.duration).toBeUndefined();
        });

        it('should apply per-turn modifiers to baseStats (cumulative)', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', { health: 10 });
            character = manager.applyEffect(character, 'poison', 3); // -1 health per turn

            const updated = manager.tickEffects(character);

            expect(updated.baseStats.health).toBe(9); // 10 - 1
            expect(updated.effects[0].duration).toBe(2);
        });

        it('should remove effects with duration 0', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'poison', 1);

            const updated = manager.tickEffects(character);

            expect(updated.effects.length).toBe(0); // Expired
        });

        it('should keep permanent effects (no duration)', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'blindness');

            const updated = manager.tickEffects(character);

            expect(updated.effects.length).toBe(1);
            expect(updated.effects[0].id).toBe('blindness');
        });

        it('should return new CharacterState (immutability)', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'poison', 5);

            const updated = manager.tickEffects(character);

            expect(updated).not.toBe(character);
            expect(updated.baseStats).not.toBe(character.baseStats);
        });

        it('should handle multiple per-turn modifiers correctly', () => {
            const gameDefs = {
                'effect1': createTestEffectDefinition('effect1', 'Effect 1', 'Effect 1', undefined, { health: -1 }),
                'effect2': createTestEffectDefinition('effect2', 'Effect 2', 'Effect 2', undefined, { health: -2 })
            };
            const manager = createTestEffectManager(gameDefs);
            let character = createTestCharacterState('test', 'Test', { health: 10 });
            character = manager.applyEffect(character, 'effect1');
            character = manager.applyEffect(character, 'effect2');

            const updated = manager.tickEffects(character);

            expect(updated.baseStats.health).toBe(7); // 10 - 1 - 2
        });

        it('should apply per-turn modifiers before removing expired effects', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState('test', 'Test', { health: 10 });
            character = manager.applyEffect(character, 'poison', 1); // Expires after this tick

            const updated = manager.tickEffects(character);

            expect(updated.baseStats.health).toBe(9); // Per-turn modifier applied
            expect(updated.effects.length).toBe(0); // Then removed
        });
    });

    describe('getBuiltinEffectDefinition', () => {
        it('should return correct definition for built-in effects', () => {
            const manager = createTestEffectManager();

            const blindness = manager.getBuiltinEffectDefinition('blindness');
            expect(blindness).toBeDefined();
            expect(blindness?.id).toBe('blindness');
            expect(blindness?.name).toBe('Blindness');
            expect(blindness?.statModifiers?.perception).toBe(-999);

            const poison = manager.getBuiltinEffectDefinition('poison');
            expect(poison).toBeDefined();
            expect(poison?.perTurnModifiers?.health).toBe(-1);
        });

        it('should return null for unknown effects', () => {
            const manager = createTestEffectManager();

            const unknown = manager.getBuiltinEffectDefinition('unknown');
            expect(unknown).toBeNull();
        });
    });

    describe('getEffectDefinition', () => {
        it('should check built-in effects first', () => {
            const gameDefs = {
                'blindness': createTestEffectDefinition('blindness', 'Custom Blindness', 'Custom')
            };
            const manager = createTestEffectManager(gameDefs);

            const result = manager.getEffectDefinition('blindness');

            // Should get built-in, not game-specific
            expect(result?.name).toBe('Blindness'); // Built-in name
        });

        it('should fall back to game-specific effects', () => {
            const gameDefs = {
                'custom': createTestEffectDefinition('custom', 'Custom', 'Custom effect')
            };
            const manager = createTestEffectManager(gameDefs);

            const result = manager.getEffectDefinition('custom');

            expect(result).toBeDefined();
            expect(result?.id).toBe('custom');
        });

        it('should return null if not found in either', () => {
            const manager = createTestEffectManager();

            const result = manager.getEffectDefinition('unknown');

            expect(result).toBeNull();
        });
    });

    describe('mergeEffectModifiers', () => {
        it('should combine static modifiers from all effects', () => {
            const manager = createTestEffectManager();
            const effects: CharacterEffect[] = [
                createTestEffect('effect1', 'game', undefined, { health: 5 }),
                createTestEffect('effect2', 'game', undefined, { health: 2, willpower: 1 })
            ];

            const merged = manager.mergeEffectModifiers(effects);

            expect(merged.health).toBe(7); // 5 + 2
            expect(merged.willpower).toBe(1);
        });

        it('should handle additive modifiers correctly', () => {
            const manager = createTestEffectManager();
            const effects: CharacterEffect[] = [
                createTestEffect('effect1', 'game', undefined, { perception: 3 }),
                createTestEffect('effect2', 'game', undefined, { perception: 2 })
            ];

            const merged = manager.mergeEffectModifiers(effects);

            expect(merged.perception).toBe(5); // 3 + 2
        });

        it('should return empty object if no effects', () => {
            const manager = createTestEffectManager();

            const merged = manager.mergeEffectModifiers([]);

            expect(merged).toEqual({});
        });

        it('should handle partial stat blocks', () => {
            const manager = createTestEffectManager();
            const effects: CharacterEffect[] = [
                createTestEffect('effect1', 'game', undefined, { health: 5 })
            ];

            const merged = manager.mergeEffectModifiers(effects);

            expect(merged.health).toBe(5);
            expect(merged.willpower).toBeUndefined();
        });
    });

    describe('mergePerTurnModifiers', () => {
        it('should combine per-turn modifiers from all effects', () => {
            const manager = createTestEffectManager();
            const effects: CharacterEffect[] = [
                createTestEffect('effect1', 'game', undefined, undefined, { health: -1 }),
                createTestEffect('effect2', 'game', undefined, undefined, { health: -2 })
            ];

            const merged = manager.mergePerTurnModifiers(effects);

            expect(merged.health).toBe(-3); // -1 + -2
        });

        it('should return empty object if no per-turn modifiers', () => {
            const manager = createTestEffectManager();
            const effects: CharacterEffect[] = [
                createTestEffect('effect1', 'game', undefined, { health: 5 }) // Only static
            ];

            const merged = manager.mergePerTurnModifiers(effects);

            expect(merged).toEqual({});
        });
    });

    describe('Built-in effects', () => {
        it('should have blindness effect that sets perception to 0', () => {
            const manager = createTestEffectManager();
            const definition = manager.getBuiltinEffectDefinition('blindness');

            expect(definition).toBeDefined();
            expect(definition?.statModifiers?.perception).toBe(-999); // Effectively 0
            expect(definition?.name).toBe('Blindness');
        });

        it('should have unconscious effect', () => {
            const manager = createTestEffectManager();
            const definition = manager.getBuiltinEffectDefinition('unconscious');

            expect(definition).toBeDefined();
            expect(definition?.name).toBe('Unconscious');
        });

        it('should have dead effect', () => {
            const manager = createTestEffectManager();
            const definition = manager.getBuiltinEffectDefinition('dead');

            expect(definition).toBeDefined();
            expect(definition?.name).toBe('Dead');
        });

        it('should have poison effect with perTurnModifiers', () => {
            const manager = createTestEffectManager();
            const definition = manager.getBuiltinEffectDefinition('poison');

            expect(definition).toBeDefined();
            expect(definition?.perTurnModifiers?.health).toBe(-1);
            expect(definition?.duration).toBe(5);
        });
    });
});

