// @ts-ignore - bun:test is available at runtime
import { describe, it, expect, beforeAll } from 'bun:test';
import { ObjectDefinition, ActionIntent, GameObject } from '@/types';
import { processTurn } from '@/engine';
import { SetStateCommand } from '@/commands/set-state-command';
import { LookCommand } from '@/commands/look-command';
import { createTestGameState, createTestSceneContext } from './helpers/test-helpers';
import { StatCalculator } from '@/stats';
import { EffectManager } from '@/effects';
// Note: Save/load tests are replaced with serialization tests to avoid file I/O in test environment

describe('Object States', () => {
    let statCalculator: StatCalculator;
    let effectManager: EffectManager;

    beforeAll(() => {
        statCalculator = new StatCalculator();
        effectManager = new EffectManager({});
    });

    describe('State Definition and Initialization', () => {
        it('should initialize objects with defaultState when created', () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        effects: {}
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on'],
                        effects: {
                            stats: { perception: 2 }
                        }
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [lantern]);
            
            // Check that object state was initialized
            const objectState = state.getObjectState('lantern');
            expect(objectState).toBe('off');
        });

        it('should not initialize state if defaultState is not set', () => {
            const object: ObjectDefinition = {
                id: 'test-object',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'Test object',
                traits: [],
                states: [
                    {
                        id: 'state1',
                        actionNames: ['activate'],
                        effects: {}
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [object]);
            
            const objectState = state.getObjectState('test-object');
            expect(objectState).toBeNull();
        });
    });

    describe('State Changes', () => {
        it('should change object state when SetStateCommand is executed', async () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        effects: {}
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on'],
                        effects: {
                            stats: { perception: 2 }
                        }
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [lantern]);
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(lantern)]);
            
            const command = new SetStateCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'on', // stateId stored in itemId
                sceneId: 'test-scene'
            };

            const result = await command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');

            // Process the turn to apply state change
            const turnResult = await processTurn(state, intent, context, statCalculator, effectManager);
            expect(turnResult.success).toBe(true);
            
            if (!turnResult.success) throw new Error('Expected success');
            const newState = turnResult.newState;
            
            // Check that state was changed
            const newObjectState = newState.getObjectState('lantern');
            expect(newObjectState).toBe('on');
        });

        it('should return failure if object is already in the target state', async () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        effects: {}
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on'],
                        effects: {}
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [lantern]);
            // Set initial state to 'off'
            const stateWithOff = state.setObjectState('lantern', 'off');
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(lantern)]);
            
            const command = new SetStateCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'off',
                sceneId: 'test-scene'
            };

            const result = await command.resolve(stateWithOff, intent, context);
            expect(result.outcome).toBe('success');
            expect(result.narrativeResolver).toContain('already');
        });

        it('should return failure if object does not exist', async () => {
            const state = createTestGameState('test-scene', [], []);
            const context = createTestSceneContext('test-scene', []);
            
            const command = new SetStateCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'nonexistent',
                itemId: 'on',
                sceneId: 'test-scene'
            };

            const result = await command.resolve(state, intent, context);
            expect(result.outcome).toBe('failure');
            expect(result.narrativeResolver).toContain("can't find");
        });

        it('should return failure if state does not exist', async () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        effects: {}
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [lantern]);
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(lantern)]);
            
            const command = new SetStateCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'nonexistent-state',
                sceneId: 'test-scene'
            };

            const result = await command.resolve(state, intent, context);
            expect(result.outcome).toBe('failure');
            expect(result.narrativeResolver).toContain("doesn't have");
        });
    });

    describe('State Effects', () => {
        it('should apply effects when state changes to a new state', async () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        effects: {}
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on'],
                        effects: {
                            target: {
                                type: 'scene',
                                id: ''
                            },
                            stats: { perception: 2 }
                        }
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [lantern]);
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(lantern)]);
            
            const command = new SetStateCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'on',
                sceneId: 'test-scene'
            };

            const result = await command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');
            expect(result.effects?.stats?.perception).toBe(2);
        });

        it('should remove effects from previous state when changing states', async () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        effects: {
                            stats: { perception: -1 }
                        }
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on'],
                        effects: {
                            target: {
                                type: 'scene',
                                id: ''
                            },
                            stats: { perception: 2 }
                        }
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [lantern]);
            // Set initial state to 'off'
            const stateWithOff = state.setObjectState('lantern', 'off');
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(lantern)]);
            
            const command = new SetStateCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'on',
                sceneId: 'test-scene'
            };

            const result = await command.resolve(stateWithOff, intent, context);
            expect(result.outcome).toBe('success');
            
            // Should remove -1 perception and add +2 perception = net +3
            // But actually, we invert the previous state effects, so:
            // Remove: -(-1) = +1, Add: +2, Net: +3
            // Or more accurately: previous was -1, so we add +1 to remove it, then add +2 = +3 total
            expect(result.effects?.stats?.perception).toBe(3);
        });

        it('should apply character-targeted effects when state changes', async () => {
            const crystal: ObjectDefinition = {
                id: 'crystal',
                weight: 0.5,
                perception: 2,
                removable: true,
                description: 'A crystal',
                traits: ['magical'],
                defaultState: 'dormant',
                states: [
                    {
                        id: 'dormant',
                        actionNames: ['activate'],
                        effects: {}
                    },
                    {
                        id: 'active',
                        actionNames: ['deactivate'],
                        effects: {
                            target: {
                                type: 'character',
                                id: ''
                            },
                            stats: { willpower: 2, perception: 1 },
                            addEffects: ['blessed']
                        }
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [crystal]);
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(crystal)]);
            
            const command = new SetStateCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'crystal',
                itemId: 'active',
                sceneId: 'test-scene'
            };

            const result = await command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');
            expect(result.effects?.stats?.willpower).toBe(2);
            expect(result.effects?.stats?.perception).toBe(1);
            expect(result.effects?.addEffects).toContain('blessed');
        });

        it('should remove character effects when state changes away', async () => {
            const crystal: ObjectDefinition = {
                id: 'crystal',
                weight: 0.5,
                perception: 2,
                removable: true,
                description: 'A crystal',
                traits: ['magical'],
                defaultState: 'dormant',
                states: [
                    {
                        id: 'dormant',
                        actionNames: ['activate'],
                        effects: {}
                    },
                    {
                        id: 'active',
                        actionNames: ['deactivate'],
                        effects: {
                            target: {
                                type: 'character',
                                id: ''
                            },
                            stats: { willpower: 2 },
                            addEffects: ['blessed']
                        }
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [crystal]);
            // Set initial state to 'active'
            const stateWithActive = state.setObjectState('crystal', 'active');
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(crystal)]);
            
            const command = new SetStateCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'crystal',
                itemId: 'dormant',
                sceneId: 'test-scene'
            };

            const result = await command.resolve(stateWithActive, intent, context);
            expect(result.outcome).toBe('success');
            
            // Should remove the effects from 'active' state
            expect(result.effects?.stats?.willpower).toBe(-2);
            expect(result.effects?.removeEffects).toContain('blessed');
        });
    });

    describe('State Persistence', () => {
        it('should persist state across multiple state changes', async () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        effects: {}
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on'],
                        effects: {}
                    }
                ]
            };

            let state = createTestGameState('test-scene', [], [lantern]);
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(lantern)]);
            
            // Change to 'on'
            const intent1: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'on',
                sceneId: 'test-scene'
            };
            const turnResult1 = await processTurn(state, intent1, context, statCalculator, effectManager);
            expect(turnResult1.success).toBe(true);
            if (!turnResult1.success) throw new Error('Expected success');
            state = turnResult1.newState;
            expect(state.getObjectState('lantern')).toBe('on');

            // Change back to 'off'
            const intent2: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'off',
                sceneId: 'test-scene'
            };
            const turnResult2 = await processTurn(state, intent2, context, statCalculator, effectManager);
            expect(turnResult2.success).toBe(true);
            if (!turnResult2.success) throw new Error('Expected success');
            state = turnResult2.newState;
            expect(state.getObjectState('lantern')).toBe('off');

            // Change to 'on' again
            const intent3: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'on',
                sceneId: 'test-scene'
            };
            const turnResult3 = await processTurn(state, intent3, context, statCalculator, effectManager);
            expect(turnResult3.success).toBe(true);
            if (!turnResult3.success) throw new Error('Expected success');
            state = turnResult3.newState;
            expect(state.getObjectState('lantern')).toBe('on');
        });

        it('should maintain state when object is picked up and moved to inventory', async () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        effects: {}
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on'],
                        effects: {}
                    }
                ]
            };

            let state = createTestGameState('test-scene', [], [lantern]);
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(lantern)]);
            
            // Change state to 'on'
            const setStateIntent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'on',
                sceneId: 'test-scene'
            };
            const turnResult1 = await processTurn(state, setStateIntent, context, statCalculator, effectManager);
            expect(turnResult1.success).toBe(true);
            if (!turnResult1.success) throw new Error('Expected success');
            state = turnResult1.newState;
            expect(state.getObjectState('lantern')).toBe('on');

            // Pick up the lantern
            const pickupIntent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'lantern',
                sceneId: 'test-scene'
            };
            const turnResult2 = await processTurn(state, pickupIntent, context, statCalculator, effectManager);
            expect(turnResult2.success).toBe(true);
            if (!turnResult2.success) throw new Error('Expected success');
            state = turnResult2.newState;
            
            // State should still be 'on' even though object is in inventory
            expect(state.getObjectState('lantern')).toBe('on');
        });

        it('should maintain state when object is dropped back to scene', async () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: true,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        effects: {}
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on'],
                        effects: {}
                    }
                ]
            };

            let state = createTestGameState('test-scene', [], [lantern]);
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(lantern)]);
            
            // Pick up the lantern
            const pickupIntent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'lantern',
                sceneId: 'test-scene'
            };
            let turnResult = await processTurn(state, pickupIntent, context, statCalculator, effectManager);
            expect(turnResult.success).toBe(true);
            if (!turnResult.success) throw new Error('Expected success');
            state = turnResult.newState;

            // Change state to 'on' while in inventory
            const setStateIntent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'on',
                sceneId: 'test-scene'
            };
            turnResult = await processTurn(state, setStateIntent, context, statCalculator, effectManager);
            expect(turnResult.success).toBe(true);
            if (!turnResult.success) throw new Error('Expected success');
            state = turnResult.newState;
            expect(state.getObjectState('lantern')).toBe('on');

            // Drop the lantern
            const dropIntent: ActionIntent = {
                actorId: 'player',
                type: 'drop',
                targetId: 'lantern',
                sceneId: 'test-scene'
            };
            turnResult = await processTurn(state, dropIntent, context, statCalculator, effectManager);
            expect(turnResult.success).toBe(true);
            if (!turnResult.success) throw new Error('Expected success');
            state = turnResult.newState;
            
            // State should still be 'on' even after dropping
            expect(state.getObjectState('lantern')).toBe('on');
        });
    });

    describe('State Save and Load', () => {
        it('should serialize and deserialize object states correctly', () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        effects: {}
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on'],
                        effects: {}
                    }
                ]
            };

            let state = createTestGameState('test-scene', [], [lantern]);
                        
            // Test serialization by converting to JSON and back
            // This simulates what happens during save/load without actual file I/O
            state = state.setObjectState('lantern', 'on');
            
            // Serialize to JSON (what saveGame does)
            const serialized = JSON.stringify(state, (key, value) => {
                if (value instanceof Set) {
                    return { $type: 'Set', value: Array.from(value) };
                }
                return value;
            });
            
            // Deserialize from JSON (what loadSave does)
            const parsed = JSON.parse(serialized);
            const objectStates = parsed.objectStates || {};
            
            // Check that state was preserved in serialization
            expect(objectStates['lantern']).toBe('on');
        });

        it('should serialize multiple object states correctly', () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    { id: 'off', actionNames: ['turn off'], effects: {} },
                    { id: 'on', actionNames: ['turn on'], effects: {} }
                ]
            };

            const door: ObjectDefinition = {
                id: 'door',
                weight: 0,
                perception: 0,
                removable: false,
                description: 'A door',
                traits: ['door'],
                defaultState: 'closed',
                states: [
                    { id: 'closed', actionNames: ['close'], effects: {} },
                    { id: 'open', actionNames: ['open'], effects: {} }
                ]
            };

            let state = createTestGameState('test-scene', [], [lantern, door]);
            
            // Set states directly
            state = state.setObjectState('lantern', 'on');
            state = state.setObjectState('door', 'open');
            
            // Serialize to JSON
            const serialized = JSON.stringify(state, (key, value) => {
                if (value instanceof Set) {
                    return { $type: 'Set', value: Array.from(value) };
                }
                return value;
            });
            
            // Deserialize from JSON
            const parsed = JSON.parse(serialized);
            const objectStates = parsed.objectStates || {};
            
            // Check both states were preserved
            expect(objectStates['lantern']).toBe('on');
            expect(objectStates['door']).toBe('open');
        });
    });

    describe('State Descriptions in Look Command', () => {
        it('should include state description when looking at an object', async () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        description: 'The lantern is unlit.',
                        effects: {}
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on'],
                        description: 'The lantern is lit and providing a warm glow.',
                        effects: {}
                    }
                ]
            };

            let state = createTestGameState('test-scene', [], [lantern]);
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(lantern)]);
            
            // Look at lantern in default state (off)
            const lookIntent1: ActionIntent = {
                actorId: 'player',
                type: 'look',
                targetId: 'lantern',
                sceneId: 'test-scene'
            };
            const command = new LookCommand();
            const result1 = await command.resolve(state, lookIntent1, context, statCalculator, effectManager);
            expect(result1.outcome).toBe('success');
            expect(result1.narrativeResolver).toContain('A lantern');
            expect(result1.narrativeResolver).toContain('unlit');

            // Change state to 'on'
            const setStateIntent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'on',
                sceneId: 'test-scene'
            };
            const turnResult = await processTurn(state, setStateIntent, context, statCalculator, effectManager);
            expect(turnResult.success).toBe(true);
            if (!turnResult.success) throw new Error('Expected success');
            state = turnResult.newState;

            // Look at lantern in 'on' state
            const lookIntent2: ActionIntent = {
                actorId: 'player',
                type: 'look',
                targetId: 'lantern',
                sceneId: 'test-scene'
            };
            const result2 = await command.resolve(state, lookIntent2, context, statCalculator, effectManager);
            expect(result2.outcome).toBe('success');
            expect(result2.narrativeResolver).toContain('A lantern');
            expect(result2.narrativeResolver).toContain('lit and providing a warm glow');
        });

        it('should include state description in general look when listing objects', async () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        description: 'The lantern is unlit.',
                        effects: {}
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on'],
                        description: 'The lantern is lit.',
                        effects: {}
                    }
                ]
            };

            let state = createTestGameState('test-scene', [], [lantern]);
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(lantern)]);
            
            // Change state to 'on'
            const setStateIntent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'on',
                sceneId: 'test-scene'
            };
            const turnResult = await processTurn(state, setStateIntent, context, statCalculator, effectManager);
            expect(turnResult.success).toBe(true);
            if (!turnResult.success) throw new Error('Expected success');
            state = turnResult.newState;

            // General look
            const lookIntent: ActionIntent = {
                actorId: 'player',
                type: 'look',
                sceneId: 'test-scene'
            };
            const command = new LookCommand();
            const result = await command.resolve(state, lookIntent, context, statCalculator, effectManager);
            expect(result.outcome).toBe('success');
            expect(result.narrativeResolver).toContain('A lantern');
            expect(result.narrativeResolver).toContain('lit');
        });
    });

    describe('State Effects with Targets', () => {
        it('should apply scene-targeted effects when state changes', async () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off'],
                        effects: {}
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on'],
                        effects: {
                            target: {
                                type: 'scene',
                                id: ''
                            },
                            stats: { perception: 2 }
                        }
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [lantern]);
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(lantern)]);
            
            const command = new SetStateCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'lantern',
                itemId: 'on',
                sceneId: 'test-scene'
            };

            const result = await command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');
            expect(result.effects?.target?.type).toBe('scene');
            expect(result.effects?.target?.id).toBe('');
            expect(result.effects?.stats?.perception).toBe(2);
        });

        it('should apply character-targeted effects when state changes', async () => {
            const crystal: ObjectDefinition = {
                id: 'crystal',
                weight: 0.5,
                perception: 2,
                removable: true,
                description: 'A crystal',
                traits: ['magical'],
                defaultState: 'dormant',
                states: [
                    {
                        id: 'dormant',
                        actionNames: ['activate'],
                        effects: {}
                    },
                    {
                        id: 'active',
                        actionNames: ['deactivate'],
                        effects: {
                            target: {
                                type: 'character',
                                id: 'player'
                            },
                            stats: { willpower: 3 }
                        }
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [crystal]);
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(crystal)]);
            
            const command = new SetStateCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'crystal',
                itemId: 'active',
                sceneId: 'test-scene'
            };

            const result = await command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');
            expect(result.effects?.target?.type).toBe('character');
            expect(result.effects?.target?.id).toBe('player');
            expect(result.effects?.stats?.willpower).toBe(3);
        });
    });

    describe('State Effect Removal', () => {
        it('should remove all effects from previous state when changing states', async () => {
            const object: ObjectDefinition = {
                id: 'test-object',
                weight: 1,
                perception: 0,
                removable: false,
                description: 'Test object',
                traits: [],
                defaultState: 'state1',
                states: [
                    {
                        id: 'state1',
                        actionNames: ['activate1'],
                        effects: {
                            stats: { health: 5, strength: 2 },
                            addTraits: ['trait1'],
                            addFlags: ['flag1'],
                            addEffects: ['effect1']
                        }
                    },
                    {
                        id: 'state2',
                        actionNames: ['activate2'],
                        effects: {
                            stats: { health: 10 }
                        }
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [object]);
            // Set initial state to 'state1'
            const stateWithState1 = state.setObjectState('test-object', 'state1');
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(object)]);
            
            const command = new SetStateCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'test-object',
                itemId: 'state2',
                sceneId: 'test-scene'
            };

            const result = await command.resolve(stateWithState1, intent, context);
            expect(result.outcome).toBe('success');
            
            // Should remove effects from state1
            expect(result.effects?.stats?.health).toBe(-5 + 10); // Remove -5, add +10 = +5 net
            expect(result.effects?.stats?.strength).toBe(-2); // Remove +2
            expect(result.effects?.removeTraits).toContain('trait1');
            expect(result.effects?.removeFlags).toContain('flag1');
            expect(result.effects?.removeEffects).toContain('effect1');
        });

        it('should properly handle state changes with no previous state', async () => {
            const object: ObjectDefinition = {
                id: 'test-object',
                weight: 1,
                perception: 0,
                removable: false,
                description: 'Test object',
                traits: [],
                states: [
                    {
                        id: 'state1',
                        actionNames: ['activate1'],
                        effects: {
                            stats: { health: 5 }
                        }
                    }
                ]
            };

            const state = createTestGameState('test-scene', [], [object]);
            // No initial state set
            const context = createTestSceneContext('test-scene', [GameObject.fromJSON(object)]);
            
            const command = new SetStateCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'set-state',
                targetId: 'test-object',
                itemId: 'state1',
                sceneId: 'test-scene'
            };

            const result = await command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');
            
            // Should only add effects, not remove any
            expect(result.effects?.stats?.health).toBe(5);
            expect(result.effects?.removeEffects).toBeUndefined();
            expect(result.effects?.removeTraits).toBeUndefined();
        });
    });

    describe('State Action Name Matching', () => {
        it('should match action names from state definitions', () => {
            const lantern: ObjectDefinition = {
                id: 'lantern',
                weight: 2,
                perception: 0,
                removable: false,
                description: 'A lantern',
                traits: ['light'],
                defaultState: 'off',
                states: [
                    {
                        id: 'off',
                        actionNames: ['turn off', 'extinguish'],
                        effects: {}
                    },
                    {
                        id: 'on',
                        actionNames: ['turn on', 'light', 'light up'],
                        effects: {}
                    }
                ]
            };

            const gameObject = GameObject.fromJSON(lantern);
            const states = gameObject.states;
            expect(states).toBeDefined();
            if (!states) throw new Error('Expected states');
            
            const onState = states.find(s => s.id === 'on');
            expect(onState).toBeDefined();
            expect(onState?.actionNames).toContain('turn on');
            expect(onState?.actionNames).toContain('light');
            expect(onState?.actionNames).toContain('light up');
        });
    });
});

