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
        const sceneFiles = await readdir(scenesDir);
        for (const file of sceneFiles) {
            if (file.endsWith('.scene.json')) {
                const scenePath = join(scenesDir, file);
                const scene = await readJsonFile<SceneDefinition>(scenePath);
                if (scene) {
                    scenes[scene.id] = scene;
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
