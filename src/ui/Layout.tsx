import React from 'react';
import { Box, Text } from 'ink';
import { GameState, GameView } from '../core/types';
import { NarrativePanel } from './components/NarrativePanel';
import { VisualsPanel } from './components/VisualsPanel';
import { InputPanel } from './components/InputPanel';

interface LayoutProps {
    state: GameState;
    currentSceneText: string;
    onInput: (value: string) => void;
    title?: string;
    normalizedInput?: import('../core/command').NormalizedCommandInput;
    errorMessage?: string;
    gameView?: GameView;
    isProcessing?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ state, currentSceneText, onInput, gameView, isProcessing }) => {
    const sceneName = gameView?.currentSceneName || state.currentSceneId;
    
    return (
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} width="100%">
            {/* Scene Name Bar */}
            <Box borderStyle="single" borderColor="cyan" height={3} flexShrink={0} justifyContent="space-between" alignItems="center" paddingLeft={1} paddingRight={1}>
                <Text bold color="cyan">Scene: {sceneName}</Text>
            </Box>

            {/* Main Content Area */}
            <Box flexDirection="row" flexGrow={1} flexShrink={1} minHeight={0}>
                <NarrativePanel
                    state={state}
                    currentSceneText={currentSceneText}
                />
                <VisualsPanel 
                    state={state} 
                    gameView={gameView}
                />
            </Box>

            {/* Input Area */}
            <Box flexDirection="column" marginTop={0} height={3} flexShrink={0}>
                <InputPanel onSubmit={onInput} isProcessing={isProcessing} />
            </Box>
        </Box>
    );
};
