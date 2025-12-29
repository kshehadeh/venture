import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { GameState } from '../../core/types';

interface NarrativePanelProps {
    state: GameState;
    currentSceneText?: string;
}

export const NarrativePanel: React.FC<NarrativePanelProps> = ({ state, currentSceneText }) => {
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
        <Box flexDirection="column" borderStyle="single" borderColor="white" width="70%" flexGrow={1} flexShrink={1} minHeight={0}>
            {/* History Area - strictly limited entries to prevent overflow */}
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minHeight={0} padding={1}>
                {visibleEntries.map((entry, idx) => (
                    <>
                        {entry.type === 'user_input' ? (
                            <Box key={`${entry.turn}-${idx}`} paddingTop={1} flexDirection="column" width="100%" marginBottom={1}>
                                <Text color="cyan" bold>{entry.text}</Text>
                            </Box>
                        ) : entry.type === 'effect' ? (
                            <Box key={`${entry.turn}-${idx}`} flexDirection="column" width="100%" marginBottom={0}>
                                <Text color="magenta" italic>
                                    {entry.text}
                                </Text>
                            </Box>
                        ) : (
                            <Box key={`${entry.turn}-${idx}`} flexDirection="column" width="100%" marginBottom={0}>
                                <Text
                                    color="white"
                                >
                                    {entry.text}
                                </Text>
                            </Box>
                        )}
                    </>
                ))}
            </Box>

            {/* Divider */}
            <Box marginY={1} paddingX={1} flexShrink={0}>
                <Text color="gray">{'─'.repeat(40)}</Text>
            </Box>

            {/* Current Context */}
            <Box flexDirection="column" paddingX={1} paddingBottom={1} flexShrink={0}>
                <Text bold color="yellow">{currentSceneText || "..."}</Text>
            </Box>
        </Box>
    );
};
