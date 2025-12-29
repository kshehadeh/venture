#!/usr/bin/env bun

import { Command } from 'commander';
import { join } from 'node:path';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import prompts from 'prompts';
import { 
    GameManifest, 
    SceneDefinition, 
    ObjectDefinition, 
    ExitDefinition,
    loadGame
} from '@venture/engine';

const program = new Command();

program
    .name('venture-editor')
    .description('CLI editor for generating and validating Venture game files')
    .version('0.0.1');

// New game command
program
    .command('new-game')
    .description('Create a new game structure')
    .argument('<gameId>', 'Game ID (folder name)')
    .action(async (gameId: string) => {
        const gamesRoot = join(process.cwd(), 'games');
        const gameDir = join(gamesRoot, gameId);

        if (existsSync(gameDir)) {
            console.error(`Error: Game directory already exists: ${gameDir}`);
            process.exit(1);
        }

        // Prompt for game details
        const response = await prompts([
            {
                type: 'text',
                name: 'name',
                message: 'Game name:',
                validate: (value: string) => value.length > 0 || 'Name is required'
            },
            {
                type: 'text',
                name: 'description',
                message: 'Game description:',
                validate: (value: string) => value.length > 0 || 'Description is required'
            },
            {
                type: 'text',
                name: 'entrySceneId',
                message: 'Entry scene ID:',
                initial: 'intro',
                validate: (value: string) => /^[a-zA-Z0-9_-]+$/.test(value) || 'Invalid scene ID format'
            }
        ]);

        if (!response.name || !response.description || !response.entrySceneId) {
            console.error('Cancelled');
            process.exit(1);
        }

        // Create game structure
        await mkdir(gameDir, { recursive: true });
        await mkdir(join(gameDir, 'scenes'), { recursive: true });

        // Create game.json
        const manifest: GameManifest = {
            id: gameId,
            name: response.name,
            description: response.description,
            entrySceneId: response.entrySceneId
        };

        await writeFile(
            join(gameDir, 'game.json'),
            JSON.stringify(manifest, null, 2) + '\n'
        );

        // Create initial scene
        const createScene = await prompts({
            type: 'confirm',
            name: 'value',
            message: 'Create initial scene?',
            initial: true
        });

        if (createScene.value) {
            await createSceneFile(gameDir, response.entrySceneId);
        }

        console.log(`✓ Created game: ${gameId}`);
        console.log(`  Location: ${gameDir}`);
    });

// New scene command
program
    .command('new-scene')
    .description('Create a new scene file')
    .argument('<gameId>', 'Game ID')
    .argument('<sceneId>', 'Scene ID')
    .action(async (gameId: string, sceneId: string) => {
        const gamesRoot = join(process.cwd(), 'games');
        const gameDir = join(gamesRoot, gameId);

        if (!existsSync(gameDir)) {
            console.error(`Error: Game directory not found: ${gameDir}`);
            process.exit(1);
        }

        await createSceneFile(gameDir, sceneId);
        console.log(`✓ Created scene: ${sceneId}`);
    });

// Validate command
program
    .command('validate')
    .description('Validate game files')
    .argument('<gameId>', 'Game ID to validate')
    .action(async (gameId: string) => {
        const gamesRoot = join(process.cwd(), 'games');
        const content = await loadGame(gamesRoot, gameId);

        if (!content) {
            console.error(`Error: Failed to load game: ${gameId}`);
            process.exit(1);
        }

        let errors: string[] = [];

        // Validate manifest
        if (!content.manifest.entrySceneId) {
            errors.push('Manifest missing entrySceneId');
        } else if (!content.scenes[content.manifest.entrySceneId]) {
            errors.push(`Entry scene not found: ${content.manifest.entrySceneId}`);
        }

        // Validate scenes
        for (const [sceneId, scene] of Object.entries(content.scenes)) {
            if (scene.exits) {
                for (const exit of scene.exits) {
                    if (!exit.nextSceneId) {
                        errors.push(`Scene ${sceneId}: Exit ${exit.direction} missing nextSceneId`);
                    } else if (!content.scenes[exit.nextSceneId]) {
                        errors.push(`Scene ${sceneId}: Exit ${exit.direction} points to non-existent scene: ${exit.nextSceneId}`);
                    }
                }
            }
        }

        if (errors.length > 0) {
            console.error('Validation errors:');
            errors.forEach(err => console.error(`  ✗ ${err}`));
            process.exit(1);
        } else {
            console.log('✓ Game validation passed');
        }
    });

// Validate scene command
program
    .command('validate-scene')
    .description('Validate a single scene file')
    .argument('<path>', 'Path to scene file')
    .action(async (path: string) => {
        try {
            const content = await readFile(path, 'utf-8');
            const scene: SceneDefinition = JSON.parse(content);

            // Basic validation
            if (!scene.id) {
                console.error('Error: Scene missing id');
                process.exit(1);
            }
            if (!scene.narrative) {
                console.error('Error: Scene missing narrative');
                process.exit(1);
            }

            console.log('✓ Scene validation passed');
        } catch (err) {
            console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
            process.exit(1);
        }
    });

// Helper function to create a scene file
async function createSceneFile(gameDir: string, sceneId: string): Promise<void> {
    const scenesDir = join(gameDir, 'scenes');
    const scenePath = join(scenesDir, `${sceneId}.scene.json`);

    if (existsSync(scenePath)) {
        const overwrite = await prompts({
            type: 'confirm',
            name: 'value',
            message: `Scene file already exists. Overwrite?`,
            initial: false
        });

        if (!overwrite.value) {
            return;
        }
    }

    // Prompt for scene details
    const response = await prompts([
        {
            type: 'text',
            name: 'narrative',
            message: 'Scene narrative:',
            validate: (value: string) => value.length > 0 || 'Narrative is required'
        }
    ]);

    if (!response.narrative) {
        console.error('Cancelled');
        process.exit(1);
    }

    const scene: SceneDefinition = {
        id: sceneId,
        narrative: response.narrative,
        objects: [],
        exits: []
    };

    await writeFile(scenePath, JSON.stringify(scene, null, 2) + '\n');
}

program.parse();

