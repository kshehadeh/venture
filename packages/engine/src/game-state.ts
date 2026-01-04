import { CharacterState } from './character-state';
import { WorldState } from './world-state';
import { SceneId, LogEntry, ActionIntent, EffectDefinition, GameContext, ConversationContext } from './types';
import { GameObject } from './game-object';

/**
 * Represents the complete game state including all characters, world state, and game metadata.
 */
export class GameState {
    characters: Record<string, CharacterState>; // All characters (player and NPCs)
    world: WorldState;
    currentSceneId: SceneId;
    log: LogEntry[];
    rngSeed: number; // For deterministic re-rolls/checks if needed
    actionHistory: ActionIntent[];
    sceneObjects: Record<SceneId, GameObject[]>; // Objects in each scene
    effectDefinitions?: Record<string, EffectDefinition>; // Game-specific effect definitions
    objectStates: Record<string, string>; // Maps objectId to current state ID
    conversationHistory: Record<string, Array<{ user: string; assistant: string }>>; // LLM conversation history per NPC/context (key is NPC ID or "query" for general queries)
    currentContext: GameContext; // Current active context (conversation, etc.)

    constructor(data: {
        characters: Record<string, CharacterState>;
        world: WorldState;
        currentSceneId: SceneId;
        log: LogEntry[];
        rngSeed: number;
        actionHistory: ActionIntent[];
        sceneObjects: Record<SceneId, GameObject[]>;
        effectDefinitions?: Record<string, EffectDefinition>;
        objectStates?: Record<string, string>;
        conversationHistory?: Record<string, Array<{ user: string; assistant: string }>>;
        currentContext?: GameContext;
    }) {
        this.characters = { ...data.characters };
        this.world = data.world instanceof WorldState ? data.world : new WorldState(data.world);
        this.currentSceneId = data.currentSceneId;
        this.log = [...data.log];
        this.rngSeed = data.rngSeed;
        this.actionHistory = [...data.actionHistory];
        // Deep clone GameObject instances
        const clonedSceneObjects: Record<SceneId, GameObject[]> = {};
        for (const [sceneId, objects] of Object.entries(data.sceneObjects)) {
            clonedSceneObjects[sceneId] = objects.map(obj => obj instanceof GameObject ? obj.clone() : new GameObject(obj));
        }
        this.sceneObjects = clonedSceneObjects;
        this.effectDefinitions = data.effectDefinitions ? { ...data.effectDefinitions } : undefined;
        this.objectStates = data.objectStates ? { ...data.objectStates } : {};
        this.conversationHistory = data.conversationHistory ? { ...data.conversationHistory } : {};
        this.currentContext = data.currentContext || { type: 'none' };
    }

    setCurrentScene(sceneId: string | null): GameState {
        if (sceneId === null) {
            // Don't change scene if null (game end)
            return this;
        }
        return new GameState({
            characters: this.characters,
            world: this.world,
            currentSceneId: sceneId,
            log: this.log,
            rngSeed: this.rngSeed,
            actionHistory: this.actionHistory,
            sceneObjects: this.sceneObjects,
            effectDefinitions: this.effectDefinitions,
            objectStates: this.objectStates,
            conversationHistory: this.conversationHistory,
            currentContext: this.currentContext
        });
    }

    updateCharacter(characterId: string, updater: (char: CharacterState) => CharacterState): GameState {
        const character = this.characters[characterId];
        if (!character) {
            return this;
        }
        const updatedChar = updater(character instanceof CharacterState ? character : new CharacterState(character));
        return new GameState({
            characters: {
                ...this.characters,
                [characterId]: updatedChar
            },
            world: this.world,
            currentSceneId: this.currentSceneId,
            log: this.log,
            rngSeed: this.rngSeed,
            actionHistory: this.actionHistory,
            sceneObjects: this.sceneObjects,
            effectDefinitions: this.effectDefinitions,
            objectStates: this.objectStates,
            conversationHistory: this.conversationHistory,
            currentContext: this.currentContext
        });
    }

    updateWorld(updater: (world: WorldState) => WorldState): GameState {
        const updatedWorld = updater(this.world instanceof WorldState ? this.world : new WorldState(this.world));
        return new GameState({
            characters: this.characters,
            world: updatedWorld,
            currentSceneId: this.currentSceneId,
            log: this.log,
            rngSeed: this.rngSeed,
            actionHistory: this.actionHistory,
            sceneObjects: this.sceneObjects,
            effectDefinitions: this.effectDefinitions,
            objectStates: this.objectStates,
            conversationHistory: this.conversationHistory,
            currentContext: this.currentContext
        });
    }

    removeSceneObject(sceneId: SceneId, objectId: string): GameState {
        const sceneObjList = this.sceneObjects[sceneId];
        if (!sceneObjList) {
            return this;
        }
        const newSceneObjList = sceneObjList.filter(obj => obj.id !== objectId);
        const newSceneObjects = { ...this.sceneObjects };
        if (newSceneObjList.length === 0) {
            delete newSceneObjects[sceneId];
        } else {
            newSceneObjects[sceneId] = newSceneObjList;
        }
        return new GameState({
            characters: this.characters,
            world: this.world,
            currentSceneId: this.currentSceneId,
            log: this.log,
            rngSeed: this.rngSeed,
            actionHistory: this.actionHistory,
            sceneObjects: newSceneObjects,
            effectDefinitions: this.effectDefinitions,
            objectStates: this.objectStates,
            conversationHistory: this.conversationHistory,
            currentContext: this.currentContext
        });
    }

    addSceneObject(sceneId: SceneId, object: GameObject): GameState {
        const sceneObjList = this.sceneObjects[sceneId] || [];
        // Check if object already exists in scene (by ID)
        const existingIndex = sceneObjList.findIndex(obj => obj.id === object.id);
        const newSceneObjList = [...sceneObjList];
        
        if (existingIndex >= 0) {
            // If object exists, update quantity if applicable, otherwise replace
            // For GameObject, we need to create a new instance with updated quantity
            // Since GameObject is immutable, we'll replace it
            newSceneObjList[existingIndex] = object.clone();
        } else {
            // Add new object
            newSceneObjList.push(object instanceof GameObject ? object.clone() : new GameObject(object));
        }
        
        const newSceneObjects = { ...this.sceneObjects };
        newSceneObjects[sceneId] = newSceneObjList;
        
        return new GameState({
            characters: this.characters,
            world: this.world,
            currentSceneId: this.currentSceneId,
            log: this.log,
            rngSeed: this.rngSeed,
            actionHistory: this.actionHistory,
            sceneObjects: newSceneObjects,
            effectDefinitions: this.effectDefinitions,
            objectStates: this.objectStates,
            conversationHistory: this.conversationHistory,
            currentContext: this.currentContext
        });
    }

    /**
     * Get the current state of an object.
     * Returns null if the object has no state set.
     */
    getObjectState(objectId: string): string | null {
        return this.objectStates[objectId] || null;
    }

    /**
     * Set the state of an object.
     * Returns a new GameState with the updated object state.
     */
    setObjectState(objectId: string, stateId: string): GameState {
        const newObjectStates = { ...this.objectStates };
        newObjectStates[objectId] = stateId;
        return new GameState({
            characters: this.characters,
            world: this.world,
            currentSceneId: this.currentSceneId,
            log: this.log,
            rngSeed: this.rngSeed,
            actionHistory: this.actionHistory,
            sceneObjects: this.sceneObjects,
            effectDefinitions: this.effectDefinitions,
            objectStates: newObjectStates,
            conversationHistory: this.conversationHistory,
            currentContext: this.currentContext
        });
    }

    /**
     * Add conversation history entry for a specific NPC or context.
     * Returns a new GameState with the conversation entry added.
     * 
     * @param contextId The NPC ID or context identifier (e.g., "query" for general queries)
     * @param userInput The user's input
     * @param assistantResponse The assistant/NPC's response
     */
    addConversationHistory(contextId: string, userInput: string, assistantResponse: string): GameState {
        const currentHistory = this.conversationHistory[contextId] || [];
        const newHistory = { ...this.conversationHistory };
        newHistory[contextId] = [...currentHistory, { user: userInput, assistant: assistantResponse }];
        
        return new GameState({
            characters: this.characters,
            world: this.world,
            currentSceneId: this.currentSceneId,
            log: this.log,
            rngSeed: this.rngSeed,
            actionHistory: this.actionHistory,
            sceneObjects: this.sceneObjects,
            effectDefinitions: this.effectDefinitions,
            objectStates: this.objectStates,
            conversationHistory: newHistory,
            currentContext: this.currentContext
        });
    }

    /**
     * Add log entries to the game state.
     * Returns a new GameState with the log entries added.
     */
    addLog(...entries: LogEntry[]): GameState {
        return new GameState({
            characters: this.characters,
            world: this.world,
            currentSceneId: this.currentSceneId,
            log: [...this.log, ...entries],
            rngSeed: this.rngSeed,
            actionHistory: this.actionHistory,
            sceneObjects: this.sceneObjects,
            effectDefinitions: this.effectDefinitions,
            objectStates: this.objectStates,
            conversationHistory: this.conversationHistory,
            currentContext: this.currentContext
        });
    }

    clone(): GameState {
        const clonedCharacters: Record<string, CharacterState> = {};
        for (const [id, char] of Object.entries(this.characters)) {
            clonedCharacters[id] = char instanceof CharacterState ? char.clone() : new CharacterState(char);
        }
        return new GameState({
            characters: clonedCharacters,
            world: this.world instanceof WorldState ? this.world.clone() : new WorldState(this.world),
            currentSceneId: this.currentSceneId,
            log: [...this.log],
            rngSeed: this.rngSeed,
            actionHistory: [...this.actionHistory],
            sceneObjects: Object.fromEntries(
                Object.entries(this.sceneObjects).map(([sceneId, objects]) => [
                    sceneId,
                    objects.map(obj => obj instanceof GameObject ? obj.clone() : new GameObject(obj))
                ])
            ),
            effectDefinitions: this.effectDefinitions ? { ...this.effectDefinitions } : undefined,
            objectStates: { ...this.objectStates },
            conversationHistory: { ...this.conversationHistory },
            currentContext: this.currentContext
        });
    }

    toJSON(): any {
        const charactersJson: Record<string, any> = {};
        for (const [id, char] of Object.entries(this.characters)) {
            charactersJson[id] = char instanceof CharacterState ? char.toJSON() : char;
        }
        return {
            characters: charactersJson,
            world: this.world instanceof WorldState ? this.world.toJSON() : this.world,
            currentSceneId: this.currentSceneId,
            log: this.log,
            rngSeed: this.rngSeed,
            actionHistory: this.actionHistory,
            sceneObjects: Object.fromEntries(
                Object.entries(this.sceneObjects).map(([sceneId, objects]) => [
                    sceneId,
                    objects.map(obj => obj instanceof GameObject ? obj.toJSON() : obj)
                ])
            ),
            effectDefinitions: this.effectDefinitions,
            objectStates: this.objectStates,
            conversationHistory: this.conversationHistory,
            currentContext: this.currentContext
        };
    }

    /**
     * Enter conversation context with an NPC.
     * Returns a new GameState with conversation context set.
     */
    enterConversationContext(npcId: string, sceneId: string): GameState {
        const currentContext = this.currentContext;
        let newContext: ConversationContext;

        if (currentContext.type === 'conversation') {
            // Already in conversation - add NPC if not already present, or switch if only one NPC at a time
            if (currentContext.npcIds.includes(npcId)) {
                // Already talking to this NPC, no change needed
                return this;
            } else {
                // Switch to new NPC (for now, replace; could extend to support multiple NPCs)
                newContext = {
                    type: 'conversation',
                    npcIds: [npcId],
                    sceneId: sceneId
                };
            }
        } else {
            // Not in conversation - start new conversation
            newContext = {
                type: 'conversation',
                npcIds: [npcId],
                sceneId: sceneId
            };
        }

        return new GameState({
            characters: this.characters,
            world: this.world,
            currentSceneId: this.currentSceneId,
            log: this.log,
            rngSeed: this.rngSeed,
            actionHistory: this.actionHistory,
            sceneObjects: this.sceneObjects,
            effectDefinitions: this.effectDefinitions,
            objectStates: this.objectStates,
            conversationHistory: this.conversationHistory,
            currentContext: newContext
        });
    }

    /**
     * Exit the current context.
     * Returns a new GameState with context cleared.
     */
    exitContext(): GameState {
        if (this.currentContext.type === 'none') {
            return this;
        }

        return new GameState({
            characters: this.characters,
            world: this.world,
            currentSceneId: this.currentSceneId,
            log: this.log,
            rngSeed: this.rngSeed,
            actionHistory: this.actionHistory,
            sceneObjects: this.sceneObjects,
            effectDefinitions: this.effectDefinitions,
            objectStates: this.objectStates,
            conversationHistory: this.conversationHistory,
            currentContext: { type: 'none' }
        });
    }

    /**
     * Switch conversation to a different NPC.
     * Returns a new GameState with conversation context updated.
     */
    switchConversationNPC(npcId: string): GameState {
        if (this.currentContext.type !== 'conversation') {
            // Not in conversation, just enter conversation with this NPC
            return this.enterConversationContext(npcId, this.currentSceneId);
        }

        if (this.currentContext.npcIds.includes(npcId)) {
            // Already talking to this NPC
            return this;
        }

        // Switch to new NPC
        return new GameState({
            characters: this.characters,
            world: this.world,
            currentSceneId: this.currentSceneId,
            log: this.log,
            rngSeed: this.rngSeed,
            actionHistory: this.actionHistory,
            sceneObjects: this.sceneObjects,
            effectDefinitions: this.effectDefinitions,
            objectStates: this.objectStates,
            conversationHistory: this.conversationHistory,
            currentContext: {
                type: 'conversation',
                npcIds: [npcId],
                sceneId: this.currentContext.sceneId
            }
        });
    }

    /**
     * Check if currently in conversation context.
     */
    isInConversationContext(): boolean {
        return this.currentContext.type === 'conversation';
    }

    /**
     * Get the list of NPC IDs in the current conversation.
     * Returns empty array if not in conversation context.
     */
    getConversationNPCs(): string[] {
        if (this.currentContext.type === 'conversation') {
            return this.currentContext.npcIds;
        }
        return [];
    }
}

