import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { GameState, CharacterState, WorldState, ObjectDefinition } from './types';
import { GameObject } from './game-object';

const SAVES_ROOT = join(process.cwd(), 'saves');

// Metadata stored in each save folder
export interface SaveMetadata {
    id: string; // The folder name e.g. "demo_1709..."
    gameId: string; // "demo"
    timestamp: number;
    turn: number;
    characterName: string;
    currentSceneId: string;
}

export async function listSaves(gameId?: string): Promise<SaveMetadata[]> {
    try {
        await mkdir(SAVES_ROOT, { recursive: true });
        const entries = await readdir(SAVES_ROOT, { withFileTypes: true });

        const saves: SaveMetadata[] = [];
        for (const entry of entries) {
            if (entry.isDirectory()) {
                try {
                    const metaPath = join(SAVES_ROOT, entry.name, 'metadata.json');
                    const content = await readFile(metaPath, 'utf-8');
                    const meta = JSON.parse(content) as SaveMetadata;

                    if (!gameId || meta.gameId === gameId) {
                        saves.push({ ...meta, id: entry.name });
                    }
                } catch {
                    // Ignore invalid folders
                }
            }
        }

        // Sort newest first
        return saves.sort((a, b) => b.timestamp - a.timestamp);

    } catch {
        return [];
    }
}

// Helper for JSON serialization of Sets and GameObjects
function replacer(key: string, value: any) {
    if (value instanceof Set) {
        return { $type: 'Set', value: Array.from(value) };
    }
    if (value instanceof GameObject) {
        return { $type: 'GameObject', value: value.toJSON() };
    }
    return value;
}

function reviver(key: string, value: any) {
    if (value && typeof value === 'object' && value !== null) {
        if (value.$type === 'Set') {
            return new Set(value.value);
        }
        if (value.$type === 'GameObject') {
            return GameObject.fromJSON(value.value as ObjectDefinition);
        }
    }
    return value;
}

export async function saveGame(state: GameState, gameId: string): Promise<string> {
    const timestamp = Date.now();
    const folderName = `${gameId}_${timestamp}`;
    const saveDir = join(SAVES_ROOT, folderName);

    await mkdir(saveDir, { recursive: true });

    // 1. Snapshot
    await writeFile(join(saveDir, 'snapshot.json'), JSON.stringify(state, replacer, 2));

    // 2. Metadata
    const player = state.characters.player;
    const meta: SaveMetadata = {
        id: folderName,
        gameId,
        timestamp,
        turn: state.world.turn,
        characterName: player?.name || 'Unknown',
        currentSceneId: state.currentSceneId
    };
    await writeFile(join(saveDir, 'metadata.json'), JSON.stringify(meta, null, 2));

    // 3. History (for replays)
    const historyLines = state.actionHistory.map(a => JSON.stringify(a)).join('\n');
    await writeFile(join(saveDir, 'history.jsonl'), historyLines);

    return folderName;
}

export async function loadSave(saveId: string): Promise<GameState | null> {
    try {
        const path = join(SAVES_ROOT, saveId, 'snapshot.json');
        const content = await readFile(path, 'utf-8');
        const parsed = JSON.parse(content, reviver);
        
        // Reconstruct class instances from plain objects
        return reconstructGameState(parsed);
    } catch (err) {
        const { logger } = await import('./logger');
        logger.error(`Failed to load save ${saveId}:`, err);
        return null;
    }
}

/**
 * Reconstruct GameState and nested class instances from plain objects
 */
function reconstructGameState(data: any): GameState {
    
    // Reconstruct characters
    const characters: Record<string, CharacterState> = {};
    if (data.characters) {
        for (const [id, char] of Object.entries(data.characters)) {
            const charData = char as any;
            // Reconstruct Sets
            const traits = charData.traits instanceof Set ? charData.traits : new Set(charData.traits || []);
            const flags = charData.flags instanceof Set ? charData.flags : new Set(charData.flags || []);
            characters[id] = new CharacterState({
                ...charData,
                traits,
                flags
            });
        }
    }
    
    // Reconstruct world
    const worldData = data.world || {};
    const world = new WorldState({
        globalFlags: worldData.globalFlags instanceof Set ? worldData.globalFlags : new Set(worldData.globalFlags || []),
        visitedScenes: worldData.visitedScenes instanceof Set ? worldData.visitedScenes : new Set(worldData.visitedScenes || []),
        turn: worldData.turn || 1
    });
    
    // Reconstruct sceneObjects - convert ObjectDefinition arrays to GameObject arrays
    const sceneObjects: Record<string, GameObject[]> = {};
    if (data.sceneObjects) {
        for (const [sceneId, objects] of Object.entries(data.sceneObjects)) {
            const objArray = objects as any[];
            sceneObjects[sceneId] = objArray.map(obj => {
                // If already a GameObject (from reviver), use it; otherwise convert from ObjectDefinition
                if (obj instanceof GameObject) {
                    return obj;
                }
                return GameObject.fromJSON(obj as ObjectDefinition);
            });
        }
    }
    
    // Reconstruct inventory entries - convert objectData to GameObject
    for (const [charId, char] of Object.entries(characters)) {
        const charState = char as CharacterState;
        const updatedInventory = charState.inventory.map(entry => {
            if (entry.objectData && !(entry.objectData instanceof GameObject)) {
                return {
                    ...entry,
                    objectData: GameObject.fromJSON(entry.objectData as any as ObjectDefinition)
                };
            }
            return entry;
        });
        if (updatedInventory !== charState.inventory) {
            characters[charId] = new CharacterState({
                ...charState,
                inventory: updatedInventory
            });
        }
    }
    
    // Reconstruct GameState
    return new GameState({
        characters,
        world,
        currentSceneId: data.currentSceneId,
        log: data.log || [],
        rngSeed: data.rngSeed || Date.now(),
        actionHistory: data.actionHistory || [],
        sceneObjects,
        effectDefinitions: data.effectDefinitions
    });
}
