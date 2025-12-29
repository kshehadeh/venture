import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Layout } from './Layout';
import { GameSelector } from './components/GameSelector';
import { GameManifest, GameView, GameEngine, loadGameList, saveGame, loadSave } from '@venture/engine';

interface AppProps {
    gamesRoot: string;
    initialGameId?: string;
    initialSaveId?: string;
    onExit?: () => void;
    onExitRequest?: (handler: () => void) => void;
}

type AppMode = 'initializing' | 'selection' | 'loading' | 'playing' | 'error';

export const App: React.FC<AppProps> = ({ gamesRoot, initialGameId, initialSaveId, onExit, onExitRequest }) => {
    const [mode, setMode] = useState<AppMode>('initializing');
    const [errorMsg, setErrorMsg] = useState('');

    // Data
    const [games, setGames] = useState<GameManifest[]>([]);
    const [gameEngine, setGameEngine] = useState<GameEngine | null>(null);
    const [gameView, setGameView] = useState<GameView | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    
    // Exit confirmation state
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    
    // Set up exit handler for SIGINT
    useEffect(() => {
        if (onExitRequest) {
            onExitRequest(() => {
                setShowExitConfirm(true);
            });
        }
    }, [onExitRequest]);

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
    useInput((input, key) => {
        if (showExitConfirm) {
            // Handle confirmation response
            if (input.toLowerCase() === 'y' || input.toLowerCase() === 'yes') {
                setShowExitConfirm(false);
                if (onExit) {
                    onExit();
                }
            } else if (input.toLowerCase() === 'n' || input.toLowerCase() === 'no' || key.escape) {
                // Cancel exit
                setShowExitConfirm(false);
            }
            return;
        }
        
        // Handle Ctrl+C to show exit confirmation
        if (key.ctrl && input === 'c') {
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
        }

        // Process input through engine
        setIsProcessing(true);
        const updatedView = await gameEngine.processInput(input);
        setGameView(updatedView);
        setIsProcessing(false);
    };

    // --- RENDER ---
    // Wrap everything in a Box that uses full terminal dimensions to prevent scrolling
    return (
        <Box width="100%" height="100%" flexDirection="column">
            {showExitConfirm ? (
                <Box justifyContent="center" alignItems="center" flexGrow={1} flexDirection="column">
                    <Text color="yellow" bold>Are you sure you want to exit? (y/n)</Text>
                </Box>
            ) : mode === 'initializing' || mode === 'loading' ? (
                <Box justifyContent="center" alignItems="center" flexGrow={1}>
                    <Text color="yellow">Loading...</Text>
                </Box>
            ) : mode === 'error' ? (
                <Box justifyContent="center" alignItems="center" flexGrow={1} flexDirection="column">
                    <Text color="red" bold>Error</Text>
                    <Text>{errorMsg}</Text>
                </Box>
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
        </Box>
    );
};
