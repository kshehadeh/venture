import React, { useMemo } from 'react';
import { GameState } from '@venture/engine';

interface NarrativePanelProps {
    state: GameState;
    currentSceneText?: string;
}

export function NarrativePanel({ state, currentSceneText }: NarrativePanelProps): React.ReactNode {
    const recentLog = state.log;

    // Ink doesn't support overflow clipping, so we must strictly limit rendered entries
    // Reserve space: scene bar (3), divider (3), current context (3), input (3) = 12 lines
    // Use a very conservative limit to ensure we don't exceed terminal height
    // This will auto-scroll to bottom by showing only the most recent entries
    // Note: Some entries may wrap to multiple lines, so we use a small number
    const MAX_VISIBLE_ENTRIES = 10;

    const visibleEntries = useMemo(() => {
        // Always show the most recent entries (auto-scroll to bottom)
        return recentLog.slice(-MAX_VISIBLE_ENTRIES);
    }, [recentLog]);

    return (
        <box style={{ flexDirection: 'column', border: true, borderStyle: 'single', borderColor: 'white', width: '70%', flexGrow: 1, flexShrink: 1, minHeight: 0 }}>
            {/* History Area - strictly limited entries to prevent overflow */}
            <box key={'history'} style={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, minHeight: 0, padding: 1 }}>
                {visibleEntries.map((entry, idx) => (
                    <React.Fragment key={`${entry.turn}-${entry.type}-${idx}`}>
                        {entry.type === 'user_input' ? (
                            <box key={`${entry.turn}-${entry.type}-${idx}`} style={{ paddingTop: 1, flexDirection: 'column', width: '100%', marginBottom: 1 }}>
                                <text fg="cyan"><strong>{entry.text}</strong></text>
                            </box>
                        ) : entry.type === 'effect' ? (
                            <box key={`${entry.turn}-${entry.type}-${idx}`} style={{ flexDirection: 'column', width: '100%', marginBottom: 0 }}>
                                <text fg="magenta"><em>{entry.text}</em></text>
                            </box>
                        ) : (
                            <box key={`${entry.turn}-${entry.type}-${idx}`} style={{ flexDirection: 'column', width: '100%', marginBottom: 0 }}>
                                <text fg="white">
                                    {entry.text}
                                </text>
                            </box>
                        )}
                    </React.Fragment>
                ))}
            </box>

            {/* Divider */}
            <box key={'divider'} style={{ margin: 1, padding: 1, flexShrink: 0 }}>
                <text fg="gray">{'─'.repeat(40)}</text>
            </box>

            {/* Current Context */}
            <box key={'current-context'} style={{ flexDirection: 'column', padding: 1, paddingBottom: 1, flexShrink: 0 }}>
                <text fg="yellow"><strong>{currentSceneText || "..."}</strong></text>
            </box>
        </box>
    );
};
