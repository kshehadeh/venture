import React from 'react';
import { createRoot } from '@opentui/react';
import { createCliRenderer } from '@opentui/core';
import { App } from './ui/App';
import { join, resolve } from 'node:path';

// Parse Args
const args = process.argv.slice(2);
let gameId: string | undefined;
let gamesRoot = join(process.cwd(), 'games');

let loadPath: string | undefined;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--game' && args[i + 1]) {
        gameId = args[i + 1];
        i++;
    }
    if (args[i] === '--load' && args[i + 1]) {
        loadPath = args[i + 1];
        i++;
    }
}

// Ensure games directory exists? Loader handles it.
// Start Renderer
const renderer = await createCliRenderer();
createRoot(renderer).render(<App gamesRoot={gamesRoot} initialGameId={gameId} initialSaveId={loadPath} />);
