import { GameState, ObjectDefinition, InventoryEntry, SceneDefinition, CharacterState, WorldState } from '../../src/core/types';
import { createHandContainers } from '../../src/core/container';
import { SceneContext } from '../../src/core/engine';
import { StatCalculator } from '../../src/core/stats';

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
    const objectsMap: Record<string, ObjectDefinition> = {};
    for (const entry of playerCharacter.inventory) {
        if (entry.objectData) {
            objectsMap[entry.id] = entry.objectData;
        }
    }
    const playerWithStats = statCalculator.updateCharacterStats(playerCharacter, objectsMap);
    // Ensure it's a CharacterState instance
    const playerWithStatsInstance = playerWithStats instanceof CharacterState ? playerWithStats : new CharacterState(playerWithStats);

    return new GameState({
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
            [sceneId]: sceneObjects
        },
        effectDefinitions: {}
    });
}

/**
 * Create a scene context for testing
 */
export function createTestSceneContext(
    sceneId: string = 'test-scene',
    objects: ObjectDefinition[] = []
): SceneContext {
    return {
        id: sceneId,
        narrative: 'Test scene narrative',
        objects: objects
    };
}

/**
 * Load test scene fixtures
 */
export async function loadTestScene(): Promise<ObjectDefinition[]> {
    const fs = await import('fs/promises');
    const path = await import('path');
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'test-scene.json');
    const content = await fs.readFile(fixturePath, 'utf-8');
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
            containerEntry.objectData = {
                ...containerEntry.objectData,
                contains: [...items]
            };
        }
    }

    // Recalculate stats after modifying inventory
    const statCalculator = new StatCalculator();
    const objectsMap: Record<string, ObjectDefinition> = {};
    for (const entry of state.characters.player.inventory) {
        if (entry.objectData) {
            objectsMap[entry.id] = entry.objectData;
        }
    }
    state.characters.player = statCalculator.updateCharacterStats(state.characters.player, objectsMap);
    
    return state;
}

