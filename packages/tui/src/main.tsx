import React, { useState, useEffect } from 'react';
import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
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

// Wrapper component to manage quit request state
function AppWrapper({ gamesRoot, initialGameId, initialSaveId }: { gamesRoot: string; initialGameId?: string; initialSaveId?: string }): React.ReactNode {
    const [quitRequested, setQuitRequested] = useState(false);

    // Handle SIGINT and SIGTERM - set quit request flag
    useEffect(() => {
        const handleSignal = () => {
            setQuitRequested(true);
        };
        
        process.on('SIGINT', handleSignal);
        process.on('SIGTERM', handleSignal);
        
        return () => {
            process.off('SIGINT', handleSignal);
            process.off('SIGTERM', handleSignal);
        };
    }, []);

    return (
        <App
            gamesRoot={gamesRoot}
            initialGameId={initialGameId}
            initialSaveId={initialSaveId}
            onExit={() => cleanup()}
            quitRequested={quitRequested}
            onQuitRequestHandled={() => setQuitRequested(false)}
        />
    );
};

process.on('exit', cleanup);

// Start Renderer
(async () => {
    const renderer = await createCliRenderer({
        exitOnCtrlC: false // We handle cleanup ourselves
    });
    
    const root = createRoot(renderer);
    root.render(<AppWrapper gamesRoot={gamesRoot} initialGameId={gameId} initialSaveId={loadPath} />);
    
    // Override cleanup to restore screen buffer
    const originalExit = process.exit;
    process.exit = ((code?: number) => {
        process.stdout.write('\u001b[?1049l'); // Exit alternate screen buffer
        originalExit(code);
    }) as typeof process.exit;
})();
