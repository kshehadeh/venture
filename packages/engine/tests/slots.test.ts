// @ts-ignore - bun:test is available at runtime
import { describe, it, expect } from 'bun:test';
import { ActionIntent, ObjectDefinition, InventoryEntry } from '@/types';
import { TransferCommand } from '@/commands/transfer-command';
import { LookCommand } from '@/commands/look-command';
import { InventoryCommand } from '@/commands/inventory-command';
import { 
    canFitInSlot, 
    findSlotInContainer, 
    getAvailableSlots, 
    getSlotContents,
    calculateContainerWeight,
    createHandContainers,
    findItemInInventory
} from '@/container';
import { createTestGameState, createTestSceneContext } from './helpers/test-helpers';
import { applyEffects } from '@/resolution';
import { GameObject } from '@/game-object';

describe('Container Slots', () => {
    describe('Slot Utility Functions', () => {
        it('should find a slot in a container by ID', () => {
            const container: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'sheath', name: 'Sheath', maxWeight: 5, itemId: null },
                    { id: 'pocket', name: 'Pocket', maxWeight: 2, itemId: null }
                ]
            };

            const slot = findSlotInContainer(container, 'sheath');
            expect(slot).toBeDefined();
            expect(slot?.id).toBe('sheath');
            expect(slot?.name).toBe('Sheath');
        });

        it('should return null for non-existent slot', () => {
            const container: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'sheath', name: 'Sheath', maxWeight: 5, itemId: null }
                ]
            };

            const slot = findSlotInContainer(container, 'nonexistent');
            expect(slot).toBeNull();
        });

        it('should check if item fits in slot', () => {
            const slot = { id: 'sheath', name: 'Sheath', maxWeight: 5, itemId: null };
            const item: ObjectDefinition = {
                id: 'sword',
                weight: 3,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            expect(canFitInSlot(item, slot)).toBe(true);
        });

        it('should reject item that exceeds slot weight limit', () => {
            const slot = { id: 'sheath', name: 'Sheath', maxWeight: 2, itemId: null };
            const item: ObjectDefinition = {
                id: 'heavy-sword',
                weight: 5,
                perception: 0,
                removable: true,
                description: 'A heavy sword',
                traits: []
            };

            expect(canFitInSlot(item, slot)).toBe(false);
        });

        it('should reject item that exceeds slot dimensions', () => {
            const slot = { 
                id: 'sheath', 
                name: 'Sheath', 
                maxWeight: 10,
                width: 2,
                height: 2,
                depth: 2,
                itemId: null 
            };
            const item: ObjectDefinition = {
                id: 'large-sword',
                weight: 3,
                perception: 0,
                removable: true,
                description: 'A large sword',
                traits: [],
                width: 3,
                height: 1,
                depth: 1
            };

            expect(canFitInSlot(item, slot)).toBe(false);
        });

        it('should reject item if slot is already occupied', () => {
            const slot = { id: 'sheath', name: 'Sheath', maxWeight: 5, itemId: 'existing-sword' };
            const item: ObjectDefinition = {
                id: 'new-sword',
                weight: 3,
                perception: 0,
                removable: true,
                description: 'A new sword',
                traits: []
            };

            expect(canFitInSlot(item, slot)).toBe(false);
        });

        it('should get available (empty) slots', () => {
            const container: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'slot1', itemId: null },
                    { id: 'slot2', itemId: 'item-id' },
                    { id: 'slot3', itemId: null }
                ]
            };

            const available = getAvailableSlots(container);
            expect(available.length).toBe(2);
            expect(available.map(s => s.id)).toEqual(['slot1', 'slot3']);
        });

        it('should get slot contents', () => {
            const container: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'slot1', itemId: 'item1' },
                    { id: 'slot2', itemId: null },
                    { id: 'slot3', itemId: 'item2' }
                ]
            };

            const contents = getSlotContents(container);
            expect(contents.length).toBe(2);
            expect(contents.map(c => c.itemId)).toEqual(['item1', 'item2']);
        });
    });

    describe('Hand Containers with Ring Slots', () => {
        it('should create hands with 5 ring slots each', () => {
            const hands = createHandContainers();
            
            expect(hands.length).toBe(2);
            
            for (const hand of hands) {
                expect(hand.slots).toBeDefined();
                expect(hand.slots?.length).toBe(5);
                expect(hand.slots?.map(s => s.id)).toEqual(['ring-1', 'ring-2', 'ring-3', 'ring-4', 'ring-5']);
                expect(hand.slots?.map(s => s.name)).toEqual(['Thumb', 'Index finger', 'Middle finger', 'Ring finger', 'Pinky']);
            }
        });

        it('should have general storage in hands for held items', () => {
            const hands = createHandContainers();
            
            for (const hand of hands) {
                expect(hand.contains).toBeDefined();
                expect(hand.maxItems).toBe(1); // For general storage
                expect(hand.maxWeight).toBe(Infinity);
            }
        });

        it('should allow placing ring in hand slot', () => {
            const ring: ObjectDefinition = {
                id: 'gold-ring',
                weight: 0.05,
                perception: 0,
                removable: true,
                description: 'A gold ring',
                traits: [],
                width: 1,
                height: 1,
                depth: 1
            };

            const hands = createHandContainers();
            const leftHand = hands[0];
            const ringSlot = leftHand.slots![0]; // ring-1 (Thumb)

            expect(canFitInSlot(ring, ringSlot)).toBe(true);
        });
    });

    describe('Transferring Items to Slots', () => {
        it('should transfer item to a slot', async () => {
            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'sheath', name: 'Sheath', maxWeight: 5, itemId: null }
                ]
            };

            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 3,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            // Place sword in left hand first
            const backpackObj = GameObject.fromJSON(backpack);
            const state = createTestGameState('test-scene', [
                { id: 'backpack', quantity: 1, objectData: backpackObj }
            ]);
            
            // Manually place sword in left hand
            const leftHandEntry = state.characters.player.inventory.find((e: InventoryEntry) => e.id === 'left-hand');
            if (leftHandEntry && leftHandEntry.objectData) {
                const handObj = leftHandEntry.objectData instanceof GameObject 
                    ? leftHandEntry.objectData 
                    : GameObject.fromJSON(leftHandEntry.objectData as any);
                const swordObj = GameObject.fromJSON(sword);
                const handJson = handObj.toJSON();
                handJson.contains = [swordObj.toJSON()];
                leftHandEntry.objectData = GameObject.fromJSON(handJson);
            }

            const context = createTestSceneContext('test-scene');

            const command = new TransferCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'sword',
                targetId: 'backpack sheath slot'
            };

            const result = command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');
            expect(result.effects?.transferItem?.slotId).toBe('sheath');
        });

        it('should transfer ring to hand ring slot', async () => {
            const ring: ObjectDefinition = {
                id: 'gold-ring',
                weight: 0.05,
                perception: 0,
                removable: true,
                description: 'A gold ring',
                traits: [],
                width: 1,
                height: 1,
                depth: 1
            };

            // Place ring in right hand first
            const state = createTestGameState('test-scene', []);
            
            // Manually place ring in right hand
            const rightHandEntry = state.characters.player.inventory.find((e: InventoryEntry) => e.id === 'right-hand');
            if (rightHandEntry && rightHandEntry.objectData) {
                const handObj = rightHandEntry.objectData instanceof GameObject 
                    ? rightHandEntry.objectData 
                    : GameObject.fromJSON(rightHandEntry.objectData as any);
                const ringObj = GameObject.fromJSON(ring);
                const handJson = handObj.toJSON();
                handJson.contains = [ringObj.toJSON()];
                rightHandEntry.objectData = GameObject.fromJSON(handJson);
            }

            const context = createTestSceneContext('test-scene');

            const command = new TransferCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'gold-ring',
                targetId: 'left-hand thumb' // Use finger name to be more specific
            };

            const result = command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');
            expect(result.effects?.transferItem?.slotId).toBe('ring-1');
            expect(result.effects?.transferItem?.toContainerId).toBe('left-hand');
        });

        it('should transfer ring to thumb using natural language', async () => {
            const ring: ObjectDefinition = {
                id: 'gold-ring',
                weight: 0.05,
                perception: 0,
                removable: true,
                description: 'A gold ring',
                traits: [],
                width: 1,
                height: 1,
                depth: 1
            };

            // Place ring in right hand first
            const state = createTestGameState('test-scene', []);
            
            // Manually place ring in right hand
            const rightHandEntry = state.characters.player.inventory.find((e: InventoryEntry) => e.id === 'right-hand');
            if (rightHandEntry && rightHandEntry.objectData) {
                const handObj = rightHandEntry.objectData instanceof GameObject 
                    ? rightHandEntry.objectData 
                    : GameObject.fromJSON(rightHandEntry.objectData as any);
                const ringObj = GameObject.fromJSON(ring);
                const handJson = handObj.toJSON();
                handJson.contains = [ringObj.toJSON()];
                rightHandEntry.objectData = GameObject.fromJSON(handJson);
            }

            const context = createTestSceneContext('test-scene');

            const command = new TransferCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'gold-ring',
                targetId: 'left-hand thumb' // Natural language: "move ring to thumb"
            };

            const result = command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');
            // Should match by slot name "Thumb" (case-insensitive)
            expect(result.effects?.transferItem?.slotId).toBe('ring-1');
            expect(result.effects?.transferItem?.toContainerId).toBe('left-hand');
        });

        it('should fail to transfer item to occupied slot', () => {
            const existingSword: ObjectDefinition = {
                id: 'existing-sword',
                weight: 3,
                perception: 0,
                removable: true,
                description: 'An existing sword',
                traits: []
            };

            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'sheath', name: 'Sheath', maxWeight: 5, itemId: 'existing-sword' }
                ]
            };

            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 3,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            // Place sword in left hand first
            const backpackObj = GameObject.fromJSON(backpack);
            const existingSwordObj = GameObject.fromJSON(existingSword);
            const state = createTestGameState('test-scene', [
                { id: 'backpack', quantity: 1, objectData: backpackObj },
                { id: 'existing-sword', quantity: 1, objectData: existingSwordObj }
            ]);
            
            // Manually place sword in left hand
            const leftHandEntry = state.characters.player.inventory.find((e: InventoryEntry) => e.id === 'left-hand');
            if (leftHandEntry && leftHandEntry.objectData) {
                const handObj = leftHandEntry.objectData instanceof GameObject 
                    ? leftHandEntry.objectData 
                    : GameObject.fromJSON(leftHandEntry.objectData as any);
                const swordObj = GameObject.fromJSON(sword);
                const handJson = handObj.toJSON();
                handJson.contains = [swordObj.toJSON()];
                leftHandEntry.objectData = GameObject.fromJSON(handJson);
            }

            const context = createTestSceneContext('test-scene');

            const command = new TransferCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'sword',
                targetId: 'backpack sheath slot'
            };

            const result = command.resolve(state, intent, context);
            expect(result.outcome).toBe('failure');
            expect(result.narrativeResolver).toContain('already occupied');
        });

        it('should fail to transfer item that exceeds slot weight', () => {
            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'sheath', name: 'Sheath', maxWeight: 2, itemId: null }
                ]
            };

            const heavySword: ObjectDefinition = {
                id: 'heavy-sword',
                weight: 5,
                perception: 0,
                removable: true,
                description: 'A heavy sword',
                traits: []
            };

            // Place heavy sword in left hand first
            const backpackObj = GameObject.fromJSON(backpack);
            const state = createTestGameState('test-scene', [
                { id: 'backpack', quantity: 1, objectData: backpackObj }
            ]);
            
            // Manually place heavy sword in left hand
            const leftHandEntry = state.characters.player.inventory.find((e: InventoryEntry) => e.id === 'left-hand');
            if (leftHandEntry && leftHandEntry.objectData) {
                const handObj = leftHandEntry.objectData instanceof GameObject 
                    ? leftHandEntry.objectData 
                    : GameObject.fromJSON(leftHandEntry.objectData as any);
                const swordObj = GameObject.fromJSON(heavySword);
                const handJson = handObj.toJSON();
                handJson.contains = [swordObj.toJSON()];
                leftHandEntry.objectData = GameObject.fromJSON(handJson);
            }

            const context = createTestSceneContext('test-scene');

            const command = new TransferCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'heavy-sword',
                targetId: 'backpack sheath slot'
            };

            const result = command.resolve(state, intent, context);
            expect(result.outcome).toBe('failure');
            expect(result.narrativeResolver).toContain("doesn't fit");
        });
    });

    describe('Slot Resolution and State Updates', () => {
        it('should place item in slot when applying transfer effect', () => {
            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'sheath', name: 'Sheath', maxWeight: 5, itemId: null }
                ]
            };

            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 3,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            const backpackObj = GameObject.fromJSON(backpack);
            const swordObj = GameObject.fromJSON(sword);
            const state = createTestGameState('test-scene', [
                { id: 'backpack', quantity: 1, objectData: backpackObj },
                { id: 'sword', quantity: 1, objectData: swordObj }
            ]);

            const result = {
                outcome: 'success' as const,
                narrativeResolver: 'Test',
                effects: {
                    transferItem: {
                        itemId: 'sword',
                        fromContainerId: null,
                        toContainerId: 'backpack',
                        slotId: 'sheath'
                    }
                }
            };

            const newState = applyEffects(state, result);

            const backpackEntry = newState.characters.player.inventory.find((e: InventoryEntry) => e.id === 'backpack');
            const slot = backpackEntry?.objectData?.slots?.find(s => s.id === 'sheath');
            
            expect(slot?.itemId).toBe('sword');
        });

        it('should remove item from slot when transferring out', () => {
            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'sheath', name: 'Sheath', maxWeight: 5, itemId: 'sword' }
                ]
            };

            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 3,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            const backpackObj = GameObject.fromJSON(backpack);
            const swordObj = GameObject.fromJSON(sword);
            const state = createTestGameState('test-scene', [
                { id: 'backpack', quantity: 1, objectData: backpackObj },
                { id: 'sword', quantity: 1, objectData: swordObj }
            ]);

            const result = {
                outcome: 'success' as const,
                narrativeResolver: 'Test',
                effects: {
                    transferItem: {
                        itemId: 'sword',
                        fromContainerId: 'backpack',
                        toContainerId: 'left-hand',
                        slotId: undefined // Transferring to general storage
                    }
                }
            };

            const newState = applyEffects(state, result);

            const backpackEntry = newState.characters.player.inventory.find((e: InventoryEntry) => e.id === 'backpack');
            const slot = backpackEntry?.objectData?.slots?.find(s => s.id === 'sheath');
            
            expect(slot?.itemId).toBeNull();
        });
    });

    describe('Weight Calculations with Slots', () => {
        it('should include slot contents in container weight', () => {
            const ring: ObjectDefinition = {
                id: 'gold-ring',
                weight: 0.1,
                perception: 0,
                removable: true,
                description: 'A gold ring',
                traits: []
            };

            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'slot1', itemId: 'gold-ring' }
                ]
            };

            const backpackObj = GameObject.fromJSON(backpack);
            const ringObj = GameObject.fromJSON(ring);
            const objectsMap: Record<string, GameObject> = {
                'backpack': backpackObj,
                'gold-ring': ringObj
            };

            const weight = calculateContainerWeight(backpack, objectsMap);
            expect(weight).toBe(1.1); // backpack (1) + ring (0.1)
        });

        it('should calculate weight with both slots and general storage', () => {
            const ring: ObjectDefinition = {
                id: 'gold-ring',
                weight: 0.1,
                perception: 0,
                removable: true,
                description: 'A gold ring',
                traits: []
            };

            const torch: ObjectDefinition = {
                id: 'torch',
                weight: 0.5,
                perception: 0,
                removable: true,
                description: 'A torch',
                traits: []
            };

            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                contains: [torch],
                slots: [
                    { id: 'slot1', itemId: 'gold-ring' }
                ]
            };

            const backpackObj = GameObject.fromJSON(backpack);
            const ringObj = GameObject.fromJSON(ring);
            const torchObj = GameObject.fromJSON(torch);
            const objectsMap: Record<string, GameObject> = {
                'backpack': backpackObj,
                'gold-ring': ringObj,
                'torch': torchObj
            };

            const weight = calculateContainerWeight(backpack, objectsMap);
            expect(weight).toBe(1.6); // backpack (1) + torch (0.5) + ring (0.1)
        });
    });

    describe('Finding Items in Slots', () => {
        it('should find item in slot', () => {
            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'sheath', itemId: 'sword' }
                ]
            };

            const backpackObj = GameObject.fromJSON(backpack);
            const inventory: InventoryEntry[] = [
                { id: 'backpack', quantity: 1, objectData: backpackObj }
            ];

            const result = findItemInInventory(inventory, 'sword');
            expect(result).toBeDefined();
            expect(result?.containerId).toBe('backpack');
            expect(result?.slotId).toBe('sheath');
        });

        it('should distinguish between item in slot vs general storage', () => {
            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                contains: [{ id: 'torch', weight: 0.5, perception: 0, removable: true, description: 'A torch', traits: [] }],
                slots: [
                    { id: 'sheath', itemId: 'sword' }
                ]
            };

            const backpackObj = GameObject.fromJSON(backpack);
            const inventory: InventoryEntry[] = [
                { id: 'backpack', quantity: 1, objectData: backpackObj }
            ];

            const swordResult = findItemInInventory(inventory, 'sword');
            expect(swordResult?.slotId).toBe('sheath');

            const torchResult = findItemInInventory(inventory, 'torch');
            expect(torchResult?.slotId).toBeNull();
        });
    });

    describe('Look Command with Slots', () => {
        it('should display slot contents when looking at container', async () => {
            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'sheath', name: 'Sheath', itemId: 'sword' },
                    { id: 'pocket', name: 'Pocket', itemId: null }
                ]
            };

            const backpackObj = GameObject.fromJSON(backpack);
            const state = createTestGameState('test-scene', [
                { id: 'backpack', quantity: 1, objectData: backpackObj }
            ]);

            const context = createTestSceneContext('test-scene');

            const command = new LookCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'look',
                sceneId: 'test-scene',
                targetId: 'backpack'
            };

            const result = await command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');
            expect(result.narrativeResolver).toContain('Slots');
            expect(result.narrativeResolver).toContain('Sheath: sword');
        });

        it('should display both general storage and slots', async () => {
            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                contains: [
                    { id: 'torch', weight: 0.5, perception: 0, removable: true, description: 'A torch', traits: [] }
                ],
                slots: [
                    { id: 'sheath', name: 'Sheath', itemId: 'sword' }
                ]
            };

            const backpackObj = GameObject.fromJSON(backpack);
            const state = createTestGameState('test-scene', [
                { id: 'backpack', quantity: 1, objectData: backpackObj }
            ]);

            const context = createTestSceneContext('test-scene');

            const command = new LookCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'look',
                sceneId: 'test-scene',
                targetId: 'backpack'
            };

            const result = await command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');
            expect(result.narrativeResolver).toContain('It contains');
            expect(result.narrativeResolver).toContain('torch');
            expect(result.narrativeResolver).toContain('Slots');
            expect(result.narrativeResolver).toContain('Sheath: sword');
        });
    });

    describe('Inventory Command with Slots', () => {
        it('should display items in slots in inventory', async () => {
            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 3,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'sheath', name: 'Sheath', maxWeight: 5, itemId: 'sword' }
                ]
            };

            const backpackObj = GameObject.fromJSON(backpack);
            const state = createTestGameState('test-scene', [
                { id: 'backpack', quantity: 1, objectData: backpackObj }
            ]);
            
            // Add sword to scene objects from all scenes so it can be looked up
            // Items in slots need to be findable from scene objects
            if (!state.sceneObjects['test-scene']) {
                state.sceneObjects['test-scene'] = [];
            }
            state.sceneObjects['test-scene'].push(GameObject.fromJSON(sword));

            const context = createTestSceneContext('test-scene');

            const command = new InventoryCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'items',
                sceneId: 'test-scene'
            };

            const result = command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');
            
            // The sword should appear in inventory even though it's in a slot
            // With the fallback, it should at least show up as a minimal item if not found in objectsMap
            expect(result.narrativeResolver).toContain('sword');
            // Should indicate it's in the backpack
            expect(result.narrativeResolver.toLowerCase()).toContain('backpack');
            // Should indicate it's in a slot (either "sheath" or "slot" should appear)
            const hasSlotInfo = result.narrativeResolver.toLowerCase().includes('sheath') || 
                               result.narrativeResolver.toLowerCase().includes('slot');
            expect(hasSlotInfo).toBe(true);
        });
    });

    describe('Backward Compatibility', () => {
        it('should work with containers without slots', () => {
            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                contains: [
                    { id: 'torch', weight: 0.5, perception: 0, removable: true, description: 'A torch', traits: [] }
                ]
            };

            const available = getAvailableSlots(backpack);
            expect(available.length).toBe(0);

            const contents = getSlotContents(backpack);
            expect(contents.length).toBe(0);
        });

        it('should transfer to general storage when no slot specified', () => {
            const backpack: ObjectDefinition = {
                id: 'backpack',
                weight: 1,
                perception: 0,
                removable: true,
                description: 'A backpack',
                traits: ['container'],
                slots: [
                    { id: 'sheath', itemId: null }
                ]
            };

            const sword: ObjectDefinition = {
                id: 'sword',
                weight: 3,
                perception: 0,
                removable: true,
                description: 'A sword',
                traits: []
            };

            const backpackObj = GameObject.fromJSON(backpack);
            const swordObj = GameObject.fromJSON(sword);
            const state = createTestGameState('test-scene', [
                { id: 'backpack', quantity: 1, objectData: backpackObj },
                { id: 'sword', quantity: 1, objectData: swordObj }
            ]);

            const context = createTestSceneContext('test-scene');

            const command = new TransferCommand();
            const intent: ActionIntent = {
                actorId: 'player',
                type: 'transfer',
                sceneId: 'test-scene',
                itemId: 'sword',
                targetId: 'backpack' // No slot specified
            };

            const result = command.resolve(state, intent, context);
            expect(result.outcome).toBe('success');
            expect(result.effects?.transferItem?.slotId).toBeUndefined();
        });
    });
});

