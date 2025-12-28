// @ts-ignore - bun:test is available at runtime
import { describe, it, expect, beforeAll } from 'bun:test';
import { ActionIntent, ObjectDefinition, InventoryEntry } from '../src/core/types';
import { processTurn } from '../src/core/engine';
import { PickupCommand } from '../src/core/commands/pickup-command';
import { InventoryCommand } from '../src/core/commands/inventory-command';
import { TransferCommand } from '../src/core/commands/transfer-command';
import { createTestGameState, createTestGameStateWithItemsInContainers, createTestSceneContext, loadTestScene, findInventoryEntry } from './helpers/test-helpers';
import { findItemInInventory } from '../src/core/container';
import { createHandContainers } from '../src/core/container';
import { StatCalculator } from '../src/core/stats';
import { EffectManager } from '../src/core/effects';

describe('Inventory Commands', () => {
    let testObjects: ObjectDefinition[];
    let statCalculator: StatCalculator;
    let effectManager: EffectManager;

    beforeAll(async () => {
        testObjects = await loadTestScene();
        statCalculator = new StatCalculator();
        effectManager = new EffectManager({});
    });

    describe('PickupCommand', () => {
        it('should successfully pick up a simple item', () => {
            const sword = testObjects.find(o => o.id === 'sword')!;
            const state = createTestGameState('test-scene', [], [sword]);
            const context = createTestSceneContext('test-scene', [sword]);
            
            const command = new PickupCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'sword',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, context);
            
            expect(result.outcome).toBe('success');
            expect(result.narrativeResolver).toContain('pick up');
            expect(result.effects?.addItems).toBeDefined();
            expect(result.effects?.addItems?.[0].id).toBe('sword');
        });

        it('should place picked up item in a container (hand)', async () => {
            const sword = testObjects.find(o => o.id === 'sword')!;
            const state = createTestGameState('test-scene', [], [sword]);
            const context = createTestSceneContext('test-scene', [sword]);
            
            const command = new PickupCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'sword',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');

            // Process the turn to apply effects
            const turnResult = await processTurn(state, intent, context, statCalculator, effectManager);
            expect(turnResult.success).toBe(true);
            
            if (!turnResult.success) throw new Error('Expected success');
            const newState = turnResult.newState;
            // Check that sword is in a hand container
            const player = newState.characters['player'];
            const leftHand = player.inventory.find(e => e.id === 'left-hand');
            const rightHand = player.inventory.find(e => e.id === 'right-hand');
            
            const swordInLeft = leftHand?.objectData?.contains?.some(o => o.id === 'sword');
            const swordInRight = rightHand?.objectData?.contains?.some(o => o.id === 'sword');
            
            expect(swordInLeft || swordInRight).toBe(true);
        });

        it('should fail to pick up non-removable objects', async () => {
            const fixedTable = testObjects.find(o => o.id === 'fixed-table')!;
            const state = createTestGameState('test-scene', [], [fixedTable]);
            const context = createTestSceneContext('test-scene', [fixedTable]);
            
            const command = new PickupCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'fixed-table',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, context);
            
            expect(result.outcome).toBe('failure');
            expect(result.narrativeResolver).toContain("can't pick up");
        });

        it('should fail to pick up objects that exceed carrying capacity', () => {
            const heavyRock = testObjects.find(o => o.id === 'heavy-rock')!;
            const state = createTestGameState('test-scene', [], [heavyRock]);
            const context = createTestSceneContext('test-scene', [heavyRock]);
            
            const command = new PickupCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'heavy-rock',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, context);
            
            expect(result.outcome).toBe('failure');
            expect(result.narrativeResolver).toContain("can't carry");
        });

        it('should fail to pick up objects with insufficient perception', () => {
            const hiddenGem = testObjects.find(o => o.id === 'hidden-gem')!;
            const state = createTestGameState('test-scene', [], [hiddenGem]);
            // Character has perception 2, gem requires 5
            const context = createTestSceneContext('test-scene', [hiddenGem]);
            
            const command = new PickupCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'hidden-gem',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, context);
            
            expect(result.outcome).toBe('failure');
            expect(result.narrativeResolver).toContain("don't notice");
        });

        it('should successfully pick up a container', async () => {
            const backpack = testObjects.find(o => o.id === 'backpack')!;
            const state = createTestGameState('test-scene', [], [backpack]);
            const context = createTestSceneContext('test-scene', [backpack]);
            
            const command = new PickupCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'backpack',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');

            const turnResult = await processTurn(state, intent, context, statCalculator, effectManager);
            expect(turnResult.success).toBe(true);
            
            if (!turnResult.success) throw new Error('Expected success');
            const newState = turnResult.newState;
            const backpackEntry = newState.characters.player.inventory.find(e => e.id === 'backpack');
            expect(backpackEntry).toBeDefined();
            expect(backpackEntry?.objectData?.traits.includes('container')).toBe(true);
        });

        it('should remove object from scene after pickup', async () => {
            const sword = testObjects.find(o => o.id === 'sword')!;
            const state = createTestGameState('test-scene', [], [sword]);
            const context = createTestSceneContext('test-scene', [sword]);
            
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'sword',
                sceneId: 'test-scene'
            };

            const turnResult = await processTurn(state, intent, context, statCalculator, effectManager);
            expect(turnResult.success).toBe(true);
            
            if (!turnResult.success) throw new Error('Expected success');
            const newState = turnResult.newState;
            const sceneObjects = newState.sceneObjects['test-scene'] || [];
            const swordStillInScene = sceneObjects.find(o => o.id === 'sword');
            expect(swordStillInScene).toBeUndefined();
        });
    });

    describe('InventoryCommand', () => {
        it('should display empty inventory message when inventory is empty', async () => {
            const state = createTestGameState('test-scene');
            const context = createTestSceneContext('test-scene');
            
            const command = new InventoryCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'items',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, context);
            
            expect(result.outcome).toBe('success');
            expect(result.narrativeResolver).toContain("not carrying anything");
        });

        it('should display items in inventory with container information', async () => {
            const sword = testObjects.find(o => o.id === 'sword')!;
            const state = createTestGameState('test-scene', [], [sword]);
            const context = createTestSceneContext('test-scene', [sword]);
            
            // First pick up the sword
            const pickupIntent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'sword',
                sceneId: 'test-scene'
            };
            const pickupResult = await processTurn(state, pickupIntent, context, statCalculator, effectManager);
            expect(pickupResult.success).toBe(true);
            
            // Then check inventory
            const command = new InventoryCommand();
            const inventoryIntent: ActionIntent = {
                actorId: 'player',
                type: 'items',
                sceneId: 'test-scene'
            };

            if (!pickupResult.success) throw new Error('Expected success');
            const result = command.resolve(pickupResult.newState, inventoryIntent, context);
            
            expect(result.outcome).toBe('success');
            expect(result.narrativeResolver).toContain('sword');
            expect(result.narrativeResolver).toMatch(/left hand|right hand/);
        });

        it('should display items in containers correctly', async () => {
            const backpack = testObjects.find(o => o.id === 'backpack')!;
            const sword = testObjects.find(o => o.id === 'sword')!;
            
            // Create state with backpack already in inventory
            const backpackEntry: InventoryEntry = {
                id: 'backpack',
                quantity: 1,
                objectData: { ...backpack, contains: [sword] }
            };
            const state = createTestGameState('test-scene', [backpackEntry], []);
            const context = createTestSceneContext('test-scene', []);
            
            const command = new InventoryCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'items',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, context);
            
            expect(result.outcome).toBe('success');
            expect(result.narrativeResolver).toContain('sword');
            expect(result.narrativeResolver).toContain('backpack');
        });
    });

    describe('TransferCommand', () => {
        it('should successfully transfer item from one container to another', async () => {
            const sword = testObjects.find(o => o.id === 'sword')!;
            const backpack = testObjects.find(o => o.id === 'backpack')!;
            
            // Start with sword in left hand and backpack in inventory
            const backpackEntry: InventoryEntry = {
                id: 'backpack',
                quantity: 1,
                objectData: backpack
            };
            
            const state = createTestGameStateWithItemsInContainers(
                'test-scene',
                [{ containerId: 'left-hand', items: [sword] }],
                [backpackEntry],
                []
            );
            const context = createTestSceneContext('test-scene', []);
            
            const command = new TransferCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'sword',
                targetId: 'backpack'
            };

            const result = command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');

            const turnResult = await processTurn(state, intent, context, statCalculator, effectManager);
            expect(turnResult.success).toBe(true);
            
            if (!turnResult.success) throw new Error('Expected success');
            const newState = turnResult.newState;
            const backpackAfter = newState.characters.player.inventory.find(e => e.id === 'backpack');
            const leftHandAfter = newState.characters.player.inventory.find(e => e.id === 'left-hand');
            
            expect(backpackAfter?.objectData?.contains?.some(o => o.id === 'sword')).toBe(true);
            expect(leftHandAfter?.objectData?.contains?.some(o => o.id === 'sword')).toBe(false);
        });

        it('should fail to transfer item to same container', async () => {
            const sword = testObjects.find(o => o.id === 'sword')!;
            const backpack = testObjects.find(o => o.id === 'backpack')!;
            
            const backpackWithSword = {
                ...backpack,
                contains: [sword]
            };
            
            const backpackEntry: InventoryEntry = {
                id: 'backpack',
                quantity: 1,
                objectData: backpackWithSword
            };
            
            const state = createTestGameState('test-scene', [backpackEntry], []);
            const context = createTestSceneContext('test-scene', []);
            
            const command = new TransferCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'sword',
                targetId: 'backpack'
            };

            const result = command.resolve(state, intent, context);
            
            expect(result.outcome).toBe('failure');
            expect(result.narrativeResolver).toContain('already in');
        });

        it('should fail to transfer item that does not fit in container (weight)', () => {
            const heavyRock = testObjects.find(o => o.id === 'heavy-rock')!;
            const smallPouch = testObjects.find(o => o.id === 'small-pouch')!;
            
            // Start with heavy rock in left hand
            const pouchEntry: InventoryEntry = {
                id: 'small-pouch',
                quantity: 1,
                objectData: smallPouch
            };
            
            const state = createTestGameStateWithItemsInContainers(
                'test-scene',
                [{ containerId: 'left-hand', items: [heavyRock] }],
                [pouchEntry],
                []
            );
            const context = createTestSceneContext('test-scene', []);
            
            const command = new TransferCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'heavy-rock',
                targetId: 'small-pouch'
            };

            const result = command.resolve(state, intent, context);
            
            expect(result.outcome).toBe('failure');
            expect(result.narrativeResolver).toContain("doesn't fit");
        });

        it('should fail to transfer item that does not fit in container (dimensions)', () => {
            const largeItem = testObjects.find(o => o.id === 'large-item')!;
            const box = testObjects.find(o => o.id === 'box')!;
            
            // Start with large item in left hand
            const boxEntry: InventoryEntry = {
                id: 'box',
                quantity: 1,
                objectData: box
            };
            
            const state = createTestGameStateWithItemsInContainers(
                'test-scene',
                [{ containerId: 'left-hand', items: [largeItem] }],
                [boxEntry],
                []
            );
            const context = createTestSceneContext('test-scene', []);
            
            const command = new TransferCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'large-item',
                targetId: 'box'
            };

            const result = command.resolve(state, intent, context);
            
            expect(result.outcome).toBe('failure');
            expect(result.narrativeResolver).toContain("doesn't fit");
        });

        it('should fail to transfer item that does not fit in container (maxItems)', () => {
            const sword = testObjects.find(o => o.id === 'sword')!;
            const smallPouch = testObjects.find(o => o.id === 'small-pouch')!;
            
            // Fill pouch to maxItems (3)
            const filledPouch = {
                ...smallPouch,
                contains: [
                    { ...sword, id: 'sword1' },
                    { ...sword, id: 'sword2' },
                    { ...sword, id: 'sword3' }
                ]
            };
            
            const pouchEntry: InventoryEntry = {
                id: 'small-pouch',
                quantity: 1,
                objectData: filledPouch
            };
            
            const state = createTestGameStateWithItemsInContainers(
                'test-scene',
                [{ containerId: 'left-hand', items: [sword] }],
                [pouchEntry],
                []
            );
            const context = createTestSceneContext('test-scene', []);
            
            const command = new TransferCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'sword',
                targetId: 'small-pouch'
            };

            const result = command.resolve(state, intent, context);
            
            expect(result.outcome).toBe('failure');
            expect(result.narrativeResolver).toContain("doesn't fit");
        });

        it('should handle transferring items between multiple containers', async () => {
            const sword = testObjects.find(o => o.id === 'sword')!;
            const backpack = testObjects.find(o => o.id === 'backpack')!;
            const smallPouch = testObjects.find(o => o.id === 'small-pouch')!;
            
            // Start with sword in left hand, backpack and pouch in inventory
            const backpackEntry: InventoryEntry = {
                id: 'backpack',
                quantity: 1,
                objectData: backpack
            };
            
            const pouchEntry: InventoryEntry = {
                id: 'small-pouch',
                quantity: 1,
                objectData: smallPouch
            };
            
            let state = createTestGameStateWithItemsInContainers(
                'test-scene',
                [{ containerId: 'left-hand', items: [sword] }],
                [backpackEntry, pouchEntry],
                []
            );
            const context = createTestSceneContext('test-scene', []);
            
            // Transfer sword to backpack
            const transferToBackpack: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'sword',
                targetId: 'backpack'
            };
            const result1 = await processTurn(state, transferToBackpack, context, statCalculator, effectManager);
            expect(result1.success).toBe(true);
            if (!result1.success) throw new Error('Expected success');
            state = result1.newState;
            
            // Transfer sword from backpack to pouch
            const transferToPouch: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'sword',
                targetId: 'small-pouch'
            };
            const result2 = await processTurn(state, transferToPouch, context, statCalculator, effectManager);
            expect(result2.success).toBe(true);
            if (!result2.success) throw new Error('Expected success');
            state = result2.newState;
            
            // Verify sword is now in pouch
            const pouchAfter = state.characters.player.inventory.find(e => e.id === 'small-pouch');
            expect(pouchAfter?.objectData?.contains?.some(o => o.id === 'sword')).toBe(true);
        });

        it('should fail to transfer item that is not in inventory', async () => {
            const backpack = testObjects.find(o => o.id === 'backpack')!;
            
            const backpackEntry: InventoryEntry = {
                id: 'backpack',
                quantity: 1,
                objectData: backpack
            };
            
            const state = createTestGameState('test-scene', [backpackEntry], []);
            const context = createTestSceneContext('test-scene', []);
            
            const command = new TransferCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'sword',
                targetId: 'backpack'
            };

            const result = command.resolve(state, intent, context);
            
            expect(result.outcome).toBe('failure');
            expect(result.narrativeResolver).toContain("don't see that item");
        });
    });

    describe('Container Constraints', () => {
        it('should respect maxItems constraint when picking up items', () => {
            const smallPouch = testObjects.find(o => o.id === 'small-pouch')!;
            const sword = testObjects.find(o => o.id === 'sword')!;
            
            // Fill a hand to maxItems (1)
            const handContainers = createHandContainers();
            const leftHand = handContainers.find(h => h.id === 'left-hand')!;
            const leftHandWithSword = {
                ...leftHand,
                contains: [sword]
            };
            
            const leftHandEntry: InventoryEntry = {
                id: 'left-hand',
                quantity: 1,
                objectData: leftHandWithSword
            };
            
            const pouchEntry: InventoryEntry = {
                id: 'small-pouch',
                quantity: 1,
                objectData: smallPouch
            };
            
            const state = createTestGameState('test-scene', [leftHandEntry, pouchEntry], [sword]);
            const context = createTestSceneContext('test-scene', [sword]);
            
            // Try to pick up another sword - should go to right hand or pouch
            const command = new PickupCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'sword',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, context);
            // Should succeed because right hand is available
            expect(result.outcome).toBe('success');
        });

        it('should respect maxWeight constraint', () => {
            const smallPouch = testObjects.find(o => o.id === 'small-pouch')!;
            const heavyRock = testObjects.find(o => o.id === 'heavy-rock')!;
            
            const pouchEntry: InventoryEntry = {
                id: 'small-pouch',
                quantity: 1,
                objectData: smallPouch
            };
            
            const state = createTestGameState('test-scene', [pouchEntry], [heavyRock]);
            const context = createTestSceneContext('test-scene', [heavyRock]);
            
            const command = new PickupCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'heavy-rock',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, context);
            // Should fail because heavy rock exceeds carrying capacity
            expect(result.outcome).toBe('failure');
        });

        it('should handle strength bonus from items when calculating carrying capacity', () => {
            const strengthBelt = testObjects.find(o => o.id === 'strength-belt')!;
            const heavyRock = testObjects.find(o => o.id === 'heavy-rock')!;
            
            // Character has strength 5, belt adds 3 = 8 total
            // Carrying capacity = 8 * 10 = 80
            // Heavy rock weighs 100, so should still fail
            const beltEntry: InventoryEntry = {
                id: 'strength-belt',
                quantity: 1,
                objectData: strengthBelt
            };
            
            const state = createTestGameState('test-scene', [beltEntry], [heavyRock]);
            const context = createTestSceneContext('test-scene', [heavyRock]);
            
            const command = new PickupCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'heavy-rock',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, context);
            // Should still fail because even with strength bonus, rock is too heavy
            expect(result.outcome).toBe('failure');
        });
    });

    describe('Complex Scenarios', () => {
        it('should handle picking up multiple items sequentially', async () => {
            const sword = testObjects.find(o => o.id === 'sword')!;
            const backpack = testObjects.find(o => o.id === 'backpack')!;
            
            let state = createTestGameState('test-scene', [], [sword, backpack]);
            const context = createTestSceneContext('test-scene', [sword, backpack]);
            
            // Pick up sword
            const swordIntent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'sword',
                sceneId: 'test-scene'
            };
            const swordResult = await processTurn(state, swordIntent, context, statCalculator, effectManager);
            expect(swordResult.success).toBe(true);
            if (!swordResult.success) throw new Error('Expected success');
            state = swordResult.newState;
            
            // Pick up backpack
            const backpackIntent: ActionIntent = {
                actorId: 'player',
                type: 'pickup',
                targetId: 'backpack',
                sceneId: 'test-scene'
            };
            const backpackResult = await processTurn(state, backpackIntent, context, statCalculator, effectManager);
            expect(backpackResult.success).toBe(true);
            if (!backpackResult.success) throw new Error('Expected success');
            state = backpackResult.newState;
            
            // Verify both items are in inventory
            const swordInInventory = findItemInInventory(state.characters.player.inventory, 'sword');
            const backpackInInventory = findInventoryEntry(state.characters.player.inventory, 'backpack');
            
            expect(swordInInventory).toBeDefined();
            expect(backpackInInventory).toBeDefined();
        });

        it('should handle transferring item from hand to backpack and back', async () => {
            const sword = testObjects.find(o => o.id === 'sword')!;
            const backpack = testObjects.find(o => o.id === 'backpack')!;
            
            // Start with sword in left hand and backpack in inventory
            const backpackEntry: InventoryEntry = {
                id: 'backpack',
                quantity: 1,
                objectData: backpack
            };
            
            let state = createTestGameStateWithItemsInContainers(
                'test-scene',
                [{ containerId: 'left-hand', items: [sword] }],
                [backpackEntry],
                []
            );
            const context = createTestSceneContext('test-scene', []);
            
            // Transfer sword to backpack
            const transferToBackpack: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'sword',
                targetId: 'backpack'
            };
            const transferResult1 = await processTurn(state, transferToBackpack, context, statCalculator, effectManager);
            expect(transferResult1.success).toBe(true);
            if (!transferResult1.success) throw new Error('Expected success');
            state = transferResult1.newState;
            
            // Verify sword is in backpack
            const backpackAfter = state.characters.player.inventory.find(e => e.id === 'backpack');
            expect(backpackAfter?.objectData?.contains?.some(o => o.id === 'sword')).toBe(true);
            
            // Transfer sword back to left hand
            const transferToHand: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'sword',
                targetId: 'left-hand'
            };
            const transferResult2 = await processTurn(state, transferToHand, context, statCalculator, effectManager);
            expect(transferResult2.success).toBe(true);
            if (!transferResult2.success) throw new Error('Expected success');
            state = transferResult2.newState;
            
            // Verify sword is back in left hand
            const leftHandAfter = state.characters.player.inventory.find(e => e.id === 'left-hand');
            expect(leftHandAfter?.objectData?.contains?.some(o => o.id === 'sword')).toBe(true);
        });
    });
});

