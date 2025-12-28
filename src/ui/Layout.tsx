import React from 'react';
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
}

export const Layout: React.FC<LayoutProps> = ({ state, currentSceneText, onInput, title, normalizedInput, errorMessage, gameView }) => {
    const sceneName = gameView?.currentSceneName || state.currentSceneId;
    
    return (
        <box flexDirection="column" height="100%">
            {/* Scene Name Bar */}
            <box borderStyle="single" borderColor="cyan" height={3} justifyContent="space-between" alignItems="center" paddingLeft={1} paddingRight={1}>
                <text bold color="cyan">Scene: {sceneName}</text>
            </box>

            {/* Main Content Area */}
            <box flexDirection="row" flexGrow={1}>
                <NarrativePanel
                    state={state}
                    currentSceneText={currentSceneText}
                />
                <VisualsPanel 
                    state={state} 
                    gameView={gameView}
                />
            </box>

            {/* Input Area */}
            <box flexDirection="column" marginTop={0} height={3} flexShrink={0}>
                <InputPanel onSubmit={onInput} />
            </box>
        </box>
    );
};
