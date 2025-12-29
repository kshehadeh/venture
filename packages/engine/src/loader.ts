import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { GameContent, GameManifest, SceneDefinition, EffectDefinition } from './types';

// Helper to read and parse JSON
async function readJsonFile<T>(path: string): Promise<T | null> {
    try {
        const content = await readFile(path, 'utf-8');
        return JSON.parse(content) as T;
    } catch (err) {
        const { logger } = await import('./logger');
        logger.error(`Failed to read JSON at ${path}:`, err);
        return null;
    }
}

/**
 * Recursively resolves hash-prefixed file references in an object.
 * Any string property that starts with '#' is treated as a file reference.
 * The file will be loaded from the scene directory and its contents will replace the string.
 * 
 * @param obj - The object to process (can be any type)
 * @param sceneDir - The directory containing the scene files
 * @returns The object with file references resolved
 */
async function resolveFileReferences(obj: any, sceneDir: string): Promise<any> {
    if (obj === null || obj === undefined) {
        return obj;
    }

    // If it's a string that starts with '#', load the file
    if (typeof obj === 'string' && obj.startsWith('#')) {
        const fileName = obj.slice(1); // Remove the '#' prefix
        const filePath = join(sceneDir, fileName);
        
        try {
            const content = await readFile(filePath, 'utf-8');
            // Trim whitespace from the file content
            return content.trim();
        } catch (err) {
            const { logger } = await import('./logger');
            logger.error(`Failed to load file reference ${obj} from ${filePath}:`, err);
            throw new Error(`Failed to load file reference: ${obj} (file not found: ${filePath})`);
        }
    }

    // If it's an array, process each element
    if (Array.isArray(obj)) {
        return Promise.all(obj.map(item => resolveFileReferences(item, sceneDir)));
    }

    // If it's an object, process each property
    if (typeof obj === 'object') {
        const resolved: any = {};
        for (const [key, value] of Object.entries(obj)) {
            resolved[key] = await resolveFileReferences(value, sceneDir);
        }
        return resolved;
    }

    // For primitives (number, boolean, etc.), return as-is
    return obj;
}

export async function loadGameList(gamesRoot: string): Promise<GameManifest[]> {
    const entries = await readdir(gamesRoot, { withFileTypes: true });
    const manifests: GameManifest[] = [];

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const manifestPath = join(gamesRoot, entry.name, 'game.json');
            const manifest = await readJsonFile<GameManifest>(manifestPath);
            if (manifest) {
                // Ensure ID matches folder name or rely on internal ID?
                // Let's trust internal ID but maybe warn if mismatch?
                manifests.push(manifest);
            }
        }
    }

    return manifests;
}

export async function loadGame(gamesRoot: string, gameId: string): Promise<GameContent | null> {
    // 1. Find the folder for this gameId (assuming convention: folder name = gameId OR scan all)
    // For simplicity, assume folder name === gameId
    const gameDir = join(gamesRoot, gameId);

    // 2. Read Manifest
    const manifest = await readJsonFile<GameManifest>(join(gameDir, 'game.json'));
    if (!manifest) return null;

    // 3. Read Scenes
    const scenesDir = join(gameDir, 'scenes');
    const scenes: Record<string, SceneDefinition> = {};

    try {
        const entries = await readdir(scenesDir, { withFileTypes: true });
        for (const entry of entries) {
            // Look for scene folders (each folder represents a scene)
            if (entry.isDirectory()) {
                const sceneFolderPath = join(scenesDir, entry.name);
                const sceneJsonPath = join(sceneFolderPath, 'scene.json');
                
                // Check if scene.json exists in the folder
                try {
                    await stat(sceneJsonPath);
                } catch {
                    // Skip folders that don't have scene.json
                    continue;
                }

                const scene = await readJsonFile<SceneDefinition>(sceneJsonPath);
                if (scene) {
                    // Resolve file references (hash-prefixed strings)
                    const resolvedScene = await resolveFileReferences(scene, sceneFolderPath) as SceneDefinition;
                    scenes[resolvedScene.id] = resolvedScene;
                }
            }
        }
    } catch (err) {
        const { logger } = await import('./logger');
        logger.error(`Failed to load scenes for game ${gameId}:`, err);
        return null;
    }

    // 4. Load Effect Definitions (optional)
    const effectDefinitions: Record<string, EffectDefinition> = {};
    try {
        const effectsPath = join(gameDir, 'effects.json');
        const effects = await readJsonFile<{ effects: EffectDefinition[] }>(effectsPath);
        if (effects && effects.effects) {
            for (const effect of effects.effects) {
                effectDefinitions[effect.id] = effect;
            }
        }
    } catch (err) {
        // Effects file is optional, so we ignore errors
    }

    // 5. Validate exits reference existing scenes
    const { logger } = await import('./logger');
    for (const [sceneId, scene] of Object.entries(scenes)) {
        if (scene.exits) {
            for (const exit of scene.exits) {
                if (!exit.nextSceneId) {
                    logger.error(`Scene ${sceneId} has exit ${exit.direction} with missing nextSceneId`);
                    continue;
                }
                if (!scenes[exit.nextSceneId]) {
                    logger.error(`Scene ${sceneId} has exit ${exit.direction} pointing to non-existent scene: ${exit.nextSceneId}`);
                }
            }
        }
    }

    return {
        manifest,
        scenes,
        effectDefinitions
    };
}
