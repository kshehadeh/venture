import React, { useState, useEffect } from 'react';
import { Layout } from './Layout';
import { GameSelector } from './components/GameSelector';
import { GameManifest, GameView } from '../core/types';
import { loadGameList } from '../core/loader';
import { saveGame, loadSave } from '../core/save';
import { GameEngine } from '../core/game-engine';
import { TextAttributes } from '@opentui/core';

interface AppProps {
    gamesRoot: string;
    initialGameId?: string;
    initialSaveId?: string;
}

type AppMode = 'initializing' | 'selection' | 'loading' | 'playing' | 'error';

export const App: React.FC<AppProps> = ({ gamesRoot, initialGameId, initialSaveId }) => {
    const [mode, setMode] = useState<AppMode>('initializing');
    const [errorMsg, setErrorMsg] = useState('');

    // Data
    const [games, setGames] = useState<GameManifest[]>([]);
    const [gameEngine, setGameEngine] = useState<GameEngine | null>(null);
    const [gameView, setGameView] = useState<GameView | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

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

    const handleInput = async (input: string) => {
        if (isProcessing || !gameEngine) return;

        // Command Handling (UI meta-commands)
        if (input.startsWith(':')) {
            const cmd = input.slice(1).trim().toLowerCase();
            if (cmd === 'save') {
                setIsProcessing(true);
                try {
                    const saveId = await saveGame(gameEngine.getState(), gameEngine.getGameId());
                    // Note: Save confirmation could be added to log, but for now we'll skip it
                    // since it's a UI feedback message. The save was successful.
                } catch (err) {
                    // Save failed - log to file
                    const { logger } = await import('../core/logger');
                    logger.error('Save failed:', err);
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

    if (mode === 'initializing' || mode === 'loading') {
        return (
            <box justifyContent="center" alignItems="center" height="100%">
                <text fg="yellow">Loading...</text>
            </box>
        );
    }

    if (mode === 'error') {
        return (
            <box justifyContent="center" alignItems="center" height="100%" flexDirection="column">
                <text fg="red" attributes={TextAttributes.BOLD}>Error</text>
                <text>{errorMsg}</text>
            </box>
        );
    }

    if (mode === 'selection') {
        return <GameSelector games={games} onSelect={launchGame} />;
    }

    // Playing
    if (!gameEngine || !gameView) return null;

    return (
        <Layout
            state={gameView.state}
            currentSceneText={gameView.currentSceneNarrative}
            onInput={handleInput}
            title="Venture"
            normalizedInput={gameView.normalizedInput}
            errorMessage={gameView.errorMessage}
            gameView={gameView}
        />
    );
};
