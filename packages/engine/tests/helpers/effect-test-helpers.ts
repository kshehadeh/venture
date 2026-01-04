import { CharacterState, StatBlock, CharacterEffect, EffectDefinition, GameState, ObjectDefinition, WorldState } from '@/types';
import { EffectManager } from '@/effects';
import { StatCalculator } from '@/stats';
import { createHandContainers } from '@/container';
import { GameObject } from '@/game-object';

/**
 * Create a character state with specified base stats and effects
 */
export function createTestCharacterState(
    id: string = 'test-character',
    name: string = 'Test Character',
    baseStats?: Partial<StatBlock>,
    effects: CharacterEffect[] = []
): CharacterState {
    const defaultStats: StatBlock = {
        health: 10,
        willpower: 5,
        perception: 2,
        reputation: 0,
        strength: 5,
        agility: 5
    };

    const handContainers = createHandContainers();
    const handInventoryEntries = handContainers.map(hand => ({
        id: hand.id,
        quantity: 1,
        objectData: hand
    }));

    const finalBaseStats = { ...defaultStats, ...baseStats };

    return new CharacterState({
        id,
        name,
        baseStats: finalBaseStats,
        stats: { ...finalBaseStats }, // Separate object, will be recalculated
        traits: new Set(),
        inventory: handInventoryEntries,
        flags: new Set(),
        effects
    });
}

/**
 * Create an effect instance for testing
 */
export function createTestEffect(
    id: string,
    source: 'builtin' | 'game' = 'game',
    duration?: number,
    statModifiers?: Partial<StatBlock>,
    perTurnModifiers?: Partial<StatBlock>
): CharacterEffect {
    return {
        id,
        source,
        duration,
        statModifiers,
        perTurnModifiers,
        metadata: {}
    };
}

/**
 * Create an effect definition for testing
 */
export function createTestEffectDefinition(
    id: string,
    name: string = id,
    description: string = `Test effect: ${id}`,
    statModifiers?: Partial<StatBlock>,
    perTurnModifiers?: Partial<StatBlock>,
    duration?: number,
    builtin: boolean = false
): EffectDefinition {
    return {
        id,
        name,
        description,
        statModifiers,
        perTurnModifiers,
        duration,
        builtin
    };
}

/**
 * Create an EffectManager with test definitions
 */
export function createTestEffectManager(
    gameDefinitions?: Record<string, EffectDefinition>
): EffectManager {
    return new EffectManager(gameDefinitions);
}

/**
 * Create a StatCalculator instance
 */
export function createTestStatCalculator(): StatCalculator {
    return new StatCalculator();
}

/**
 * Create a GameState with characters that have effects
 */
export function createTestGameStateWithEffects(
    sceneId: string = 'test-scene',
    characters: Record<string, CharacterState> = {},
    sceneObjects: ObjectDefinition[] = []
): GameState {
    const defaultPlayer = createTestCharacterState('player', 'Player');
    const allCharacters = {
        player: defaultPlayer,
        ...characters
    };

    // Ensure all characters are CharacterState instances
    const characterInstances: Record<string, CharacterState> = {};
    for (const [id, char] of Object.entries(allCharacters)) {
        characterInstances[id] = char instanceof CharacterState ? char : new CharacterState(char);
    }

    return new GameState({
        characters: characterInstances,
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
            [sceneId]: sceneObjects.map(obj => GameObject.fromJSON(obj))
        },
        effectDefinitions: {}
    });
}
