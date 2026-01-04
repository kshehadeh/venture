import React, { useState, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { Layout } from './Layout';
import { GameSelector } from './components/GameSelector';
import { GameManifest, GameView, GameEngine, loadGameList, saveGame, loadSave } from '@venture/engine';

interface AppProps {
    gamesRoot: string;
    initialGameId?: string;
    initialSaveId?: string;
    onExit?: () => void;
    quitRequested?: boolean;
    onQuitRequestHandled?: () => void;
}

type AppMode = 'initializing' | 'selection' | 'loading' | 'playing' | 'error';

export function App({ gamesRoot, initialGameId, initialSaveId, onExit, quitRequested, onQuitRequestHandled }: AppProps): React.ReactNode {
    const [mode, setMode] = useState<AppMode>('initializing');
    const [errorMsg, setErrorMsg] = useState('');

    // Data
    const [games, setGames] = useState<GameManifest[]>([]);
    const [gameEngine, setGameEngine] = useState<GameEngine | null>(null);
    const [gameView, setGameView] = useState<GameView | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Exit confirmation state
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    
    // Watch for quit request prop changes
    useEffect(() => {
        if (quitRequested) {
            setShowExitConfirm(true);
            if (onQuitRequestHandled) {
                onQuitRequestHandled();
            }
        }
    }, [quitRequested, onQuitRequestHandled]);

    // Initialization Effect
    useEffect(() => {
        const init = async () => {
            // 1. If explicit save ID provided, load it
            if (initialSaveId) {
                setMode('loading');
                const loaded = await loadSave(initialSaveId);
                if (loaded) {
                    // Extract gameId from save ID (format: gameId_timestamp)
                    // Or we could read from metadata, but for now use the pattern
                    const gameId = initialSaveId.split('_')[0];
                    const engine = await GameEngine.fromSave(gamesRoot, gameId, loaded);
                    if (engine) {
                        setGameEngine(engine);
                        setGameView(engine.getView());
                        setMode('playing');
                        return;
                    }
                }
                setErrorMsg(`Failed to load save: ${initialSaveId}`);
                setMode('error');
                return;
            }

            // 2. If explicit game ID provided
            if (initialGameId) {
                setMode('loading');
                await launchGame(initialGameId);
            } else {
                // 3. Otherwise load list
                const list = await loadGameList(gamesRoot);
                if (list.length === 0) {
                    setErrorMsg(`No games found in ${gamesRoot}`);
                    setMode('error');
                    return;
                }
                setGames(list);
                setMode('selection');
            }
        };
        init();
    }, [gamesRoot, initialGameId, initialSaveId]);

    const launchGame = async (gameId: string) => {
        setMode('loading');
        const engine = await GameEngine.create(gamesRoot, gameId);
        if (!engine) {
            setErrorMsg(`Failed to load game: ${gameId}`);
            setMode('error');
            return;
        }

        setGameEngine(engine);
        setGameView(engine.getView());
        setMode('playing');
    };

    // Handle exit confirmation input
    useKeyboard((key) => {
        if (showExitConfirm) {
            // Handle confirmation response - check if key.name is a single character
            const keyName = key.name?.toLowerCase();
            if (keyName === 'y') {
                setShowExitConfirm(false);
                if (onExit) {
                    onExit();
                }
            } else if (keyName === 'n' || key.name === 'escape') {
                // Cancel exit
                setShowExitConfirm(false);
            }
            return;
        }
        
        // Handle Ctrl+C to show exit confirmation
        if (key.ctrl && key.name === 'c') {
            setShowExitConfirm(true);
            return;
        }
    });

    const handleInput = async (input: string) => {
        // Block input during exit confirmation
        if (showExitConfirm) return;
        
        if (isProcessing || !gameEngine) return;

        // Command Handling (UI meta-commands)
        if (input.startsWith(':')) {
            const cmd = input.slice(1).trim().toLowerCase();
            if (cmd === 'save') {
                setIsProcessing(true);
                try {
                    await saveGame(gameEngine.getState(), gameEngine.getGameId());
                    // Note: Save confirmation could be added to log, but for now we'll skip it
                    // since it's a UI feedback message. The save was successful.
                } catch (err) {
                    // Save failed - log to console (logger is internal to engine)
                    console.error('Save failed:', err);
                }
                setIsProcessing(false);
                return;
            }
            if (cmd === 'exit' || cmd === 'quit') {
                if (onExit) {
                    onExit();
                }
                return;
            }
        }

        // Process input through engine
        setIsProcessing(true);
        const updatedView = await gameEngine.processInput(input);
        setGameView(updatedView);
        setIsProcessing(false);
    };

    // --- RENDER ---
    // Wrap everything in a box that uses full terminal dimensions to prevent scrolling
    return (
        <box style={{ width: '100%', height: '100%', flexDirection: 'column' }}>
            {showExitConfirm ? (
                <box style={{ justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexDirection: 'column' }}>
                    <text fg="yellow"><strong>Are you sure you want to exit? (y/n)</strong></text>
                </box>
            ) : mode === 'initializing' || mode === 'loading' ? (
                <box style={{ justifyContent: 'center', alignItems: 'center', flexGrow: 1 }}>
                    <text fg="yellow">Loading...</text>
                </box>
            ) : mode === 'error' ? (
                <box style={{ justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexDirection: 'column' }}>
                    <text fg="red"><strong>Error</strong></text>
                    <text>{errorMsg}</text>
                </box>
            ) : mode === 'selection' ? (
                <GameSelector games={games} onSelect={launchGame} />
            ) : gameEngine && gameView ? (
                <Layout
                    state={gameView.state}
                    currentSceneText={gameView.currentSceneNarrative}
                    onInput={handleInput}
                    title="Venture"
                    normalizedInput={gameView.normalizedInput}
                    errorMessage={gameView.errorMessage}
                    gameView={gameView}
                    isProcessing={isProcessing}
                />
            ) : null}
        </box>
    );
};
