import React from 'react';
import { GameState, GameView, NormalizedCommandInput } from '@venture/engine';
import { NarrativePanel } from './components/NarrativePanel';
import { VisualsPanel } from './components/VisualsPanel';
import { InputPanel } from './components/InputPanel';

interface LayoutProps {
    state: GameState;
    currentSceneText: string;
    onInput: (value: string) => void;
    title?: string;
    normalizedInput?: NormalizedCommandInput;
    errorMessage?: string;
    gameView?: GameView;
    isProcessing?: boolean;
}

export function Layout({ state, currentSceneText, onInput, gameView, isProcessing }: LayoutProps): React.ReactNode {
    const sceneName = gameView?.currentSceneName || state.currentSceneId;
    const currentContext = gameView?.currentContext || state.currentContext;
    
    // Get NPC names for conversation context
    let contextStatus = '';
    if (currentContext.type === 'conversation') {
        const npcIds = currentContext.npcIds;
        if (npcIds.length > 0 && gameView?.currentSceneNPCs) {
            const npcNames = npcIds
                .map(id => gameView.currentSceneNPCs?.find(npc => npc.id === id)?.name || id)
                .join(', ');
            contextStatus = `Conversing with: ${npcNames}`;
        } else {
            contextStatus = 'In conversation mode';
        }
    }
    
    return (
        <box style={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, minHeight: 0, width: '100%' }}>
            {/* Scene Name Bar */}
            <box style={{ border: true, borderStyle: 'single', borderColor: 'cyan', height: 3, flexShrink: 0, justifyContent: 'space-between', alignItems: 'center', paddingLeft: 1, paddingRight: 1 }}>
                <text fg="cyan"><strong>Scene: {sceneName}</strong></text>
                {contextStatus && (
                    <text fg="yellow"><strong>{contextStatus}</strong></text>
                )}
            </box>

            {/* Main Content Area */}
            <box style={{ flexDirection: 'row', flexGrow: 1, flexShrink: 1, minHeight: 0 }}>
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
            <box style={{ flexDirection: 'column', marginTop: 0, height: 3, flexShrink: 0 }}>
                <InputPanel 
                    onSubmit={onInput} 
                    isProcessing={isProcessing}
                    conversationContext={currentContext.type === 'conversation' ? currentContext : undefined}
                    npcs={gameView?.currentSceneNPCs}
                />
            </box>
        </box>
    );
};
