import { GameState, GameContent, GameView, GameManifest, SceneDefinition, LogEntry, CharacterState, WorldState } from './types';
import { loadGame } from './loader';
import { parseCommand } from './command';
import { processTurn, SceneContext, getVisibleObjects, getVisibleExits, getCharacterPerception } from './engine';
import { createHandContainers } from './container';
import { EffectManager } from './effects';
import { StatCalculator } from './stats';

/**
 * High-level game engine API that encapsulates game content and state.
 * This class provides a clean interface between the UI and the core game logic.
 */
export class GameEngine {
    private state: GameState;
    private content: GameContent;
    private gamesRoot: string;
    private gameId: string;
    private effectManager: EffectManager;
    private statCalculator: StatCalculator;

    private constructor(
        gamesRoot: string,
        gameId: string,
        content: GameContent,
        initialState: GameState,
        effectManager: EffectManager
    ) {
        this.gamesRoot = gamesRoot;
        this.gameId = gameId;
        this.content = content;
        this.state = initialState;
        this.effectManager = effectManager;
        this.statCalculator = new StatCalculator();
    }

    /**
     * Create a new GameEngine instance by loading a game.
     */
    static async create(
        gamesRoot: string,
        gameId: string
    ): Promise<GameEngine | null> {
        const content = await loadGame(gamesRoot, gameId);
        if (!content) {
            return null;
        }

        // Create EffectManager with game-specific effect definitions
        const effectManager = new EffectManager(content.effectDefinitions);

        const initialState = GameEngine.createInitialState(
            content.manifest.entrySceneId,
            content.scenes[content.manifest.entrySceneId],
            content.scenes,
            effectManager
        );

        return new GameEngine(gamesRoot, gameId, content, initialState, effectManager);
    }

    /**
     * Create a GameEngine instance from a loaded save state.
     */
    static async fromSave(
        gamesRoot: string,
        gameId: string,
        savedState: GameState
    ): Promise<GameEngine | null> {
        const content = await loadGame(gamesRoot, gameId);
        if (!content) {
            return null;
        }

        // Create EffectManager with game-specific effect definitions
        const effectManager = new EffectManager(content.effectDefinitions);

        // Recalculate stats for all characters after load
        const statCalculator = new StatCalculator();
        const updatedCharacters: Record<string, typeof savedState.characters[string]> = {};
        for (const [charId, character] of Object.entries(savedState.characters)) {
            const objectsMap: Record<string, typeof savedState.sceneObjects[string][number]> = {};
            for (const entry of character.inventory) {
                if (entry.objectData) {
                    objectsMap[entry.id] = entry.objectData;
                }
            }
            updatedCharacters[charId] = statCalculator.updateCharacterStats(character, objectsMap);
        }
        savedState.characters = updatedCharacters;

        return new GameEngine(gamesRoot, gameId, content, savedState, effectManager);
    }

    /**
     * Create initial game state for a new game.
     */
    private static createInitialState(
        entrySceneId: string,
        entryScene?: SceneDefinition,
        allScenes?: Record<string, SceneDefinition>,
        effectManager?: EffectManager
    ): GameState {
        // Create hand containers
        const handContainers = createHandContainers();
        const handInventoryEntries = handContainers.map(hand => ({
            id: hand.id,
            quantity: 1,
            objectData: hand
        }));

        // Initialize base stats
        const baseStats = { health: 10, willpower: 5, perception: 2, reputation: 0, strength: 5, agility: 5 };

        // Create initial character with baseStats
        const playerCharacter = new CharacterState({
            id: "player",
            name: "Hero",
            baseStats: baseStats,
            stats: baseStats, // Will be recalculated
            traits: new Set(),
            inventory: handInventoryEntries, // Start with hand containers
            flags: new Set(),
            effects: []
        });

        // Calculate initial current stats
        const statCalculator = new StatCalculator();
        const objectsMap: Record<string, typeof handContainers[number]> = {};
        for (const entry of playerCharacter.inventory) {
            if (entry.objectData) {
                objectsMap[entry.id] = entry.objectData;
            }
        }
        const playerWithStats = statCalculator.updateCharacterStats(playerCharacter, objectsMap);
        // Ensure it's a CharacterState instance
        const playerWithStatsInstance = playerWithStats instanceof CharacterState ? playerWithStats : new CharacterState(playerWithStats);

        const initialState = new GameState({
            characters: {
                player: playerWithStatsInstance
            },
            world: new WorldState({
                globalFlags: new Set(),
                visitedScenes: new Set(),
                turn: 1
            }),
            currentSceneId: entrySceneId,
            log: [],
            rngSeed: Date.now(),
            actionHistory: [],
            sceneObjects: {},
            effectDefinitions: {}
        });

        // Initialize sceneObjects from all loaded scenes
        // NPCs are NOT initialized here - they're defined in scenes and only added to game state
        // when they're encountered or need to track dynamic state (inventory, effects, etc.)
        if (allScenes) {
            for (const [sceneId, scene] of Object.entries(allScenes)) {
                if (scene.objects && scene.objects.length > 0) {
                    initialState.sceneObjects[sceneId] = [...scene.objects];
                }
                // NPCs remain in scene definitions - they'll be added to state.characters
                // when encountered or when they need to track state changes
            }
        }

        // Set initial narrative if entry scene exists
        if (entryScene) {
            initialState.log = [{ turn: 0, text: entryScene.narrative, type: "narrative" }];
        } else {
            initialState.log = [{ turn: 0, text: "Begin.", type: "narrative" }];
        }

        return initialState;
    }

    /**
     * Build SceneContext from current state and game content.
     */
    private buildSceneContext(): SceneContext {
        const currentScene = this.content.scenes[this.state.currentSceneId];
        if (!currentScene) {
            throw new Error(`Scene ${this.state.currentSceneId} not found`);
        }

        // Get current perception using StatCalculator
        const statCalculator = new StatCalculator();
        const playerPerception = getCharacterPerception(this.state, 'player', statCalculator);

        // Get objects from scene and filter by perception
        const sceneObjects = this.state.sceneObjects[currentScene.id] || [];
        const visibleObjects = getVisibleObjects(sceneObjects, playerPerception);

        // Get exits from scene definition and filter by perception
        const exits = currentScene.exits || [];
        const visibleExits = getVisibleExits(exits, playerPerception);

        return {
            id: currentScene.id,
            narrative: currentScene.narrative,
            objects: visibleObjects,
            exits: visibleExits,
            npcs: currentScene.npcs || [], // Include NPCs from scene definition
            detailedDescriptions: currentScene.detailedDescriptions // Include detailed descriptions for the scene
        };
    }

    /**
     * Process raw user input and return updated game view.
     */
    async processInput(input: string): Promise<GameView> {
        // Build scene context
        const sceneContext = this.buildSceneContext();

        // Parse the command using the scene context
        const commandResult = await parseCommand(input, sceneContext);

        // Add user input to log before processing
        const userInputLog: LogEntry = {
            turn: this.state.world.turn,
            text: `> ${input}`,
            type: 'user_input'
        };
        this.state = new GameState({
            ...this.state,
            log: [...this.state.log, userInputLog]
        });

        // Handle parsing errors or unhandled input
        if (!commandResult.handled || !commandResult.intent) {
            return {
                ...this.getView(),
                errorMessage: commandResult.feedback || `I don't understand "${input}".`,
                normalizedInput: commandResult.normalizedInput
            };
        }

        // Process the turn
        const { logger } = await import('./logger');
        logger.log('[GameEngine] About to call processTurn with intent:', JSON.stringify(commandResult.intent, null, 2));
        logger.log('[GameEngine] Current state inventory:', JSON.stringify(this.state.characters.player?.inventory, null, 2));
        const turnResult = await processTurn(this.state, commandResult.intent, sceneContext, this.statCalculator, this.effectManager);
        logger.log('[GameEngine] processTurn result:', JSON.stringify({ 
            success: turnResult.success, 
            reason: turnResult.success ? undefined : turnResult.reason 
        }, null, 2));

        if (!turnResult.success) {
            // Add error to log
            const errorLog: LogEntry = {
                turn: this.state.world.turn,
                text: `❌ ${turnResult.reason || 'Unknown error'}`,
                type: 'debug'
            };
            this.state = new GameState({
                ...this.state,
                log: [...this.state.log, errorLog]
            });
            return {
                ...this.getView(),
                errorMessage: turnResult.reason,
                normalizedInput: commandResult.normalizedInput
            };
        }

        // Update state with new state from turn
        this.state = turnResult.newState;

        // Return updated view with normalized input for debugging
        return {
            ...this.getView(),
            normalizedInput: commandResult.normalizedInput
        };
    }

    /**
     * Get current game view for display.
     */
    getView(): GameView {
        const currentScene = this.content.scenes[this.state.currentSceneId];
        if (!currentScene) {
            return {
                state: this.state,
                currentSceneNarrative: "Scene not found",
            };
        }

        // Build scene context
        const sceneContext = this.buildSceneContext();

        return {
            state: this.state,
            currentSceneNarrative: currentScene.narrative,
            currentSceneName: currentScene.id,
            currentSceneExits: sceneContext.exits,
            currentSceneObjects: sceneContext.objects,
            currentSceneNPCs: sceneContext.npcs
        };
    }

    /**
     * Get current game state (for save/load).
     */
    getState(): GameState {
        return this.state;
    }

    /**
     * Load a saved game state.
     */
    loadState(state: GameState): void {
        this.state = state;
    }

    /**
     * Get the game ID.
     */
    getGameId(): string {
        return this.gameId;
    }

    /**
     * Get the game manifest.
     */
    getManifest(): GameManifest {
        return this.content.manifest;
    }
}

