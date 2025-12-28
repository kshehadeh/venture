import React from 'react';
import { GameState } from '../../core/types';

interface NarrativePanelProps {
    state: GameState;
    currentSceneText?: string;
}

export const NarrativePanel: React.FC<NarrativePanelProps> = ({ state, currentSceneText }) => {
    // Show last 20 log entries? ScrollBox enables scrolling!
    const recentLog = state.log;

    return (
        <box flexDirection="column" borderStyle="single" borderColor="white" width="70%" padding={1}>
            {/* History Area */}
            <scrollbox flexDirection="column" flexGrow={1} scrollTo="end">
                {recentLog.map((entry, idx) => (
                    <text key={`${entry.turn}-${idx}`} color={entry.type === 'narrative' ? 'white' : 'gray'}>
                        {entry.text}
                    </text>
                ))}
            </scrollbox>

            {/* Divider - using Box? or just padding */}
            <box marginY={1}>
                <text color="gray">{'─'.repeat(40)}</text>
            </box>

            {/* Current Context */}
            <box flexDirection="column">
                <text bold color="yellow">{currentSceneText || "..."}</text>
            </box>
        </box>
    );
};
