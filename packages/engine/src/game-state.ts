import { CharacterState } from './character-state';
import { WorldState } from './world-state';
import { SceneId, LogEntry, ActionIntent, EffectDefinition } from './types';
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
            objectStates: this.objectStates
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
            objectStates: this.objectStates
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
            objectStates: this.objectStates
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
            objectStates: this.objectStates
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
            objectStates: this.objectStates
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
            objectStates: newObjectStates
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
            objectStates: this.objectStates
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
            objectStates: { ...this.objectStates }
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
            objectStates: this.objectStates
        };
    }
}

