// @ts-ignore - bun:test is available at runtime
import { describe, it, expect } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { saveGame, loadSave } from '@/save';
import { GameObject } from '@/game-object';
import { createTestGameState } from './helpers/test-helpers';
import { ActionIntent, ObjectDefinition } from '@/types';

describe('Save and Load', () => {
    it('should round-trip game state with inventory, object states, and context', async () => {
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

        const ring: ObjectDefinition = {
            id: 'ring',
            weight: 1,
            perception: 0,
            removable: true,
            description: 'A gold ring',
            traits: []
        };

        const backpack: ObjectDefinition = {
            id: 'backpack',
            weight: 2,
            perception: 0,
            removable: true,
            description: 'A worn backpack',
            traits: ['container'],
            contains: [ring],
            maxWeight: 20,
            maxItems: 5
        };

        let state = createTestGameState('camp', [
            {
                id: 'backpack',
                quantity: 1,
                objectData: GameObject.fromJSON(backpack)
            }
        ], [lantern]);

        state = state.setObjectState('lantern', 'on');
        state = state.updateWorld(world => world.addFlag('met-guide').markSceneVisited('camp').markSceneVisited('forest').incrementTurn());
        state = state.updateCharacter('player', character => character.addTrait('brave').addFlag('quest-started'));
        state = state.enterConversationContext('npc-guard', 'camp');
        state = state.addConversationHistory('npc-guard', 'Hello', 'Stay vigilant.');
        state.actionHistory.push({
            actorId: 'player',
            type: 'look',
            sceneId: 'camp',
            timestamp: 123
        } satisfies ActionIntent);

        const saveId = await saveGame(state, 'testgame');
        const savePath = join(process.cwd(), 'saves', saveId);

        try {
            const loaded = await loadSave(saveId);
            expect(loaded).not.toBeNull();
            if (!loaded) {
                return;
            }

            expect(loaded.currentSceneId).toBe('camp');
            expect(loaded.world.turn).toBe(state.world.turn);
            expect(loaded.world.globalFlags instanceof Set).toBe(true);
            expect(loaded.world.globalFlags.has('met-guide')).toBe(true);
            expect(loaded.world.visitedScenes.has('forest')).toBe(true);

            const player = loaded.characters.player;
            expect(player).toBeDefined();
            expect(player.traits instanceof Set).toBe(true);
            expect(player.traits.has('brave')).toBe(true);
            expect(player.flags.has('quest-started')).toBe(true);

            const backpackEntry = player.inventory.find(entry => entry.id === 'backpack');
            expect(backpackEntry?.objectData instanceof GameObject).toBe(true);
            const backpackObj = backpackEntry?.objectData;
            const backpackContains = backpackObj?.contains || [];
            expect(backpackContains.length).toBe(1);
            expect(backpackContains[0].id).toBe('ring');

            expect(loaded.getObjectState('lantern')).toBe('on');
            expect(loaded.isInConversationContext()).toBe(true);
            expect(loaded.getConversationNPCs()).toEqual(['npc-guard']);
            expect(loaded.conversationHistory['npc-guard']?.[0]?.user).toBe('Hello');

            expect(loaded.actionHistory.length).toBe(1);
            expect(loaded.actionHistory[0].type).toBe('look');

            const sceneObjects = loaded.sceneObjects['camp'] || [];
            expect(sceneObjects.length).toBe(1);
            expect(sceneObjects[0] instanceof GameObject).toBe(true);
            expect(sceneObjects[0].id).toBe('lantern');
        } finally {
            await rm(savePath, { recursive: true, force: true });
        }
    });
});
