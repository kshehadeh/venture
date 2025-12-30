import { GameState, ObjectDefinition, InventoryEntry, SceneDefinition, CharacterState, WorldState } from '@/types';
import { createHandContainers } from '@/container';
import { SceneContext } from '@/engine';
import { StatCalculator } from '@/stats';
import { GameObject } from '@/game-object';
import Bun from 'bun';

/**
 * Create a test game state with default character stats
 */
export function createTestGameState(
    sceneId: string = 'test-scene',
    initialInventory: InventoryEntry[] = [],
    sceneObjects: ObjectDefinition[] = []
): GameState {
    const handContainers = createHandContainers();
    const handInventoryEntries = handContainers.map(hand => ({
        id: hand.id,
        quantity: 1,
        objectData: hand
    }));

    const baseStats = {
        health: 10,
        willpower: 5,
        perception: 2,
        reputation: 0,
        strength: 5,
        agility: 5
    };

    const playerCharacter = new CharacterState({
        id: 'player',
        name: 'Test Hero',
        baseStats: baseStats,
        stats: baseStats, // Will be recalculated
        traits: new Set(),
        inventory: [...handInventoryEntries, ...initialInventory],
        flags: new Set(),
        effects: []
    });

    // Calculate initial current stats
    const statCalculator = new StatCalculator();
    const objectsMap: Record<string, GameObject> = {};
    for (const entry of playerCharacter.inventory) {
        if (entry.objectData) {
            objectsMap[entry.id] = entry.objectData;
        }
    }
    const playerWithStats = statCalculator.updateCharacterStats(playerCharacter, objectsMap);
    // Ensure it's a CharacterState instance
    const playerWithStatsInstance = playerWithStats instanceof CharacterState ? playerWithStats : new CharacterState(playerWithStats);

    // Convert ObjectDefinition[] to GameObject[]
    const gameObjects = sceneObjects.map(obj => GameObject.fromJSON(obj));
    
    const gameState = new GameState({
        characters: {
            player: playerWithStatsInstance
        },
        world: new WorldState({
            globalFlags: new Set(),
            visitedScenes: new Set(),
            turn: 1
        }),
        currentSceneId: sceneId,
        log: [],
        rngSeed: 12345,
        actionHistory: [],
        sceneObjects: {
            [sceneId]: gameObjects
        },
        effectDefinitions: {},
        objectStates: {}
    });

    // Initialize object states to their defaultState if they have one
    for (const objDef of sceneObjects) {
        if (objDef.defaultState) {
            const gameObj = GameObject.fromJSON(objDef);
            return gameState.setObjectState(gameObj.id, objDef.defaultState);
        }
    }

    return gameState;
}

/**
 * Create a scene context for testing
 */
export function createTestSceneContext(
    sceneId: string = 'test-scene',
    objects: ObjectDefinition[] | GameObject[] = []
): SceneContext {
    // Convert ObjectDefinition[] to GameObject[] if needed
    const gameObjects = objects.map(obj => 
        obj instanceof GameObject ? obj : GameObject.fromJSON(obj)
    );
    return {
        id: sceneId,
        narrative: 'Test scene narrative',
        objects: gameObjects
    };
}

/**
 * Load test scene fixtures
 */
export async function loadTestScene(): Promise<ObjectDefinition[]> {
    // Construct path relative to this file using import.meta.url
    const currentFileUrl = new URL(import.meta.url);
    const fixtureUrl = new URL('../fixtures/test-scene.json', currentFileUrl);
    // Use Bun's file API
    const file = Bun.file(fixtureUrl.pathname);
    const content = await file.text();
    const scene = JSON.parse(content) as SceneDefinition;
    return scene.objects || [];
}

/**
 * Find an inventory entry by item ID (including nested containers)
 * Returns the entry and container ID if found in a container
 */
export function findInventoryEntry(
    inventory: InventoryEntry[],
    itemId: string
): { entry: InventoryEntry; containerId: string | null } | null {
    for (const entry of inventory) {
        if (entry.id === itemId) {
            return { entry, containerId: null };
        }
        if (entry.objectData?.traits.includes('container')) {
            const contains = entry.objectData.contains || [];
            for (const item of contains) {
                if (item.id === itemId) {
                    return { entry, containerId: entry.id };
                }
            }
        }
    }
    return null;
}

/**
 * Get total inventory weight
 */
export function getTotalInventoryWeight(inventory: InventoryEntry[]): number {
    let total = 0;
    for (const entry of inventory) {
        if (entry.objectData) {
            total += calculateContainerWeight(entry.objectData);
        }
    }
    return total;
}

/**
 * Calculate container weight recursively
 */
function calculateContainerWeight(container: ObjectDefinition): number {
    let totalWeight = container.weight * (container.quantity || 1);
    if (container.contains && container.contains.length > 0) {
        for (const item of container.contains) {
            totalWeight += calculateContainerWeight(item);
        }
    }
    return totalWeight;
}

/**
 * Count items in a container
 */
export function countItemsInContainer(container: ObjectDefinition): number {
    return (container.contains || []).length;
}

/**
 * Create a test game state with items already placed in containers.
 * This modifies the default hand containers to include the specified items.
 */
export function createTestGameStateWithItemsInContainers(
    sceneId: string = 'test-scene',
    itemsInContainers: Array<{ containerId: string; items: ObjectDefinition[] }> = [],
    additionalInventory: InventoryEntry[] = [],
    sceneObjects: ObjectDefinition[] = []
): GameState {
    const state = createTestGameState(sceneId, additionalInventory, sceneObjects);
    
    // Update containers with items
    for (const { containerId, items } of itemsInContainers) {
        const containerEntry = state.characters.player.inventory.find(e => e.id === containerId);
        if (containerEntry && containerEntry.objectData) {
            // Create new GameObject from existing one's JSON with updated contains
            const objJson = containerEntry.objectData.toJSON();
            objJson.contains = items; // Use ObjectDefinition[] for toJSON
            containerEntry.objectData = GameObject.fromJSON(objJson);
        }
    }

    // Recalculate stats after modifying inventory
    const statCalculator = new StatCalculator();
    const objectsMap: Record<string, GameObject> = {};
    for (const entry of state.characters.player.inventory) {
        if (entry.objectData) {
            objectsMap[entry.id] = entry.objectData;
        }
    }
    state.characters.player = statCalculator.updateCharacterStats(state.characters.player, objectsMap);
    
    return state;
}

