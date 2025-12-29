import React from 'react';
import { render } from 'ink';
import { App } from './ui/App';
import Bun from 'bun';
import { cwd } from 'node:process';
import { join } from 'node:path';
// Parse Args
const args = Bun.argv.slice(2);
let gameId: string | undefined;
let gamesRoot = join(cwd(), 'games');

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

// Enable alternate screen buffer (fullscreen mode)
// This switches to a separate screen buffer, preventing scrolling
process.stdout.write('\u001b[?1049h'); // Enter alternate screen buffer
process.stdout.write('\u001b[2J'); // Clear screen

// Cleanup function to restore normal screen buffer on exit
const cleanup = () => {
    process.stdout.write('\u001b[?1049l'); // Exit alternate screen buffer
    process.exit();
};

// Shared state for exit handling
let exitHandler: (() => void) | null = null;

// Handle SIGINT - notify App component instead of immediately exiting
process.on('SIGINT', () => {
    if (exitHandler) {
        exitHandler();
    }
});

process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

// Start Renderer
// Use patchConsole: false to prevent console output from interfering with the UI
const instance = render(<App gamesRoot={gamesRoot} initialGameId={gameId} initialSaveId={loadPath} onExit={() => cleanup()} onExitRequest={(handler) => { exitHandler = handler; }} />, {
    patchConsole: false,
    exitOnCtrlC: false // We handle cleanup ourselves
});

// Override the exit method to restore screen buffer (if it exists)
if ('exit' in instance && typeof (instance as any).exit === 'function') {
    const originalExit = (instance as any).exit;
    (instance as any).exit = () => {
        process.stdout.write('\u001b[?1049l'); // Exit alternate screen buffer
        originalExit.call(instance);
    };
}
