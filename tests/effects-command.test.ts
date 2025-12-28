// @ts-ignore - bun:test is available at runtime
import { describe, it, expect } from 'bun:test';
import { EffectsCommand } from '../src/core/commands/effects-command';
import { GameState, ActionIntent, SceneContext } from '../src/core/types';
import {
    createTestCharacterState,
    createTestGameStateWithEffects,
    createTestEffectManager
} from './helpers/effect-test-helpers';

describe('EffectsCommand', () => {
    const command = new EffectsCommand();
    const sceneContext: SceneContext = {
        id: 'test-scene',
        narrative: 'Test scene',
        objects: [],
        exits: []
    };

    describe('execute', () => {
        it('should create correct ActionIntent', () => {
            const input = { command: 'effects', parameters: {} };
            const intent = command.execute(input, sceneContext);

            expect(intent.actorId).toBe('player');
            expect(intent.type).toBe('choice');
            expect(intent.choiceId).toBe('effects');
            expect(intent.sceneId).toBe('test-scene');
        });

        it('should use correct command ID', () => {
            expect(command.getCommandId()).toBe('effects');
        });

        it('should require no parameters', () => {
            const schema = command.getParameterSchema();
            const result = schema.safeParse({});
            expect(result.success).toBe(true);
        });
    });

    describe('resolve', () => {
        it('should show "No active effects" when character has no effects', () => {
            const character = createTestCharacterState();
            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            const intent: ActionIntent = {
                actorId: 'player',
                type: 'choice',
                choiceId: 'effects',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, sceneContext);

            expect(result.outcome).toBe('success');
            expect(result.narrativeResolver).toContain('no active effects');
        });

        it('should display all active effects with names', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'poison', 5);
            character = manager.applyEffect(character, 'blindness');

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            const intent: ActionIntent = {
                actorId: 'player',
                type: 'choice',
                choiceId: 'effects',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, sceneContext);

            expect(result.outcome).toBe('success');
            expect(result.narrativeResolver).toContain('Poisoned');
            expect(result.narrativeResolver).toContain('Blindness');
        });

        it('should show effect descriptions from definitions', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'poison');

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            const intent: ActionIntent = {
                actorId: 'player',
                type: 'choice',
                choiceId: 'effects',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, sceneContext);

            expect(result.narrativeResolver).toContain('You feel a burning sensation');
        });

        it('should show duration remaining for temporary effects', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'poison', 3);

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            const intent: ActionIntent = {
                actorId: 'player',
                type: 'choice',
                choiceId: 'effects',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, sceneContext);

            expect(result.narrativeResolver).toContain('3 turn');
        });

        it('should show "Permanent" for effects without duration', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'blindness');

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            const intent: ActionIntent = {
                actorId: 'player',
                type: 'choice',
                choiceId: 'effects',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, sceneContext);

            expect(result.narrativeResolver).toContain('Permanent');
        });

        it('should display stat modifiers correctly', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'blindness');

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            const intent: ActionIntent = {
                actorId: 'player',
                type: 'choice',
                choiceId: 'effects',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, sceneContext);

            expect(result.narrativeResolver).toContain('perception');
        });

        it('should display per-turn modifiers correctly', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'poison', 5);

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            const intent: ActionIntent = {
                actorId: 'player',
                type: 'choice',
                choiceId: 'effects',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, sceneContext);

            expect(result.narrativeResolver).toContain('per turn');
            expect(result.narrativeResolver).toContain('health');
        });

        it('should format output correctly (readable)', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'poison', 3);

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            const intent: ActionIntent = {
                actorId: 'player',
                type: 'choice',
                choiceId: 'effects',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, sceneContext);

            expect(result.narrativeResolver).toContain('Active Effects');
            expect(result.narrativeResolver).toContain('-');
        });

        it('should handle effects without definitions gracefully', () => {
            const character = createTestCharacterState();
            character.effects = [
                {
                    id: 'unknown-effect',
                    source: 'game',
                    duration: 5
                }
            ];

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            const intent: ActionIntent = {
                actorId: 'player',
                type: 'choice',
                choiceId: 'effects',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, sceneContext);

            expect(result.outcome).toBe('success');
            expect(result.narrativeResolver).toContain('unknown-effect');
        });

        it('should show effects in consistent order', () => {
            const manager = createTestEffectManager();
            let character = createTestCharacterState();
            character = manager.applyEffect(character, 'blindness');
            character = manager.applyEffect(character, 'poison', 5);

            const state = createTestGameStateWithEffects('test-scene', {
                player: character
            });

            const intent: ActionIntent = {
                actorId: 'player',
                type: 'choice',
                choiceId: 'effects',
                sceneId: 'test-scene'
            };

            const result1 = command.resolve(state, intent, sceneContext);
            const result2 = command.resolve(state, intent, sceneContext);

            // Should be consistent (effects stored in array order)
            expect(result1.narrativeResolver).toBe(result2.narrativeResolver);
        });
    });

    describe('Command Registration', () => {
        it('should be registered in CommandRegistry', async () => {
            const { getCommandRegistry } = await import('../src/core/command');
            const registry = getCommandRegistry();
            const registeredCommand = registry.getCommand('effects');

            expect(registeredCommand).toBeDefined();
            expect(registeredCommand?.getCommandId()).toBe('effects');
        });

        it('should work with aliases', async () => {
            const { parseCommand } = await import('../src/core/command');
            const context: SceneContext = {
                id: 'test-scene',
                narrative: 'Test',
                objects: [],
                exits: []
            };

            // Test that aliases are in globals
            const { ENGINE_GLOBAL_ACTIONS } = await import('../src/core/globals');
            const effectsAction = ENGINE_GLOBAL_ACTIONS.find(a => a.id === 'effects');
            expect(effectsAction).toBeDefined();
            expect(effectsAction?.aliases).toContain('status');
            expect(effectsAction?.aliases).toContain('conditions');
            expect(effectsAction?.aliases).toContain('affects');
        });
    });
});

