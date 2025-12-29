import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { GameManifest } from '@venture/engine';

interface GameSelectorProps {
    games: GameManifest[];
    onSelect: (gameId: string) => void;
}

export const GameSelector: React.FC<GameSelectorProps> = ({ games, onSelect }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useInput((input, key) => {
        if (key.upArrow || input === 'k') { // Vim bindings support ;)
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : games.length - 1));
        }
        if (key.downArrow || input === 'j') {
            setSelectedIndex(prev => (prev < games.length - 1 ? prev + 1 : 0));
        }
        if (key.return || input === 'enter') {
            onSelect(games[selectedIndex].id);
        }
    });

    return (
        <Box flexDirection="column" borderStyle="single" borderColor="cyan" padding={1} width="100%" height="100%">
            <Box marginBottom={1} justifyContent="center">
                <Text bold color="cyan">Select a Game</Text>
            </Box>

            <Box flexDirection="column" flexGrow={1}>
                {games.map((game, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                        <Box key={game.id} flexDirection="column" paddingY={0} paddingX={1} borderStyle={isSelected ? 'single' : undefined} borderColor="yellow">
                            <Text color={isSelected ? 'yellow' : 'white'} bold={isSelected}>
                                {isSelected ? '> ' : '  '} {game.name}
                            </Text>
                            <Text color="gray">
                                {'    ' + game.description}
                            </Text>
                        </Box>
                    );
                })}
            </Box>

            <Box marginTop={1}>
                <Text color="gray">Use ↑/↓ to navigate, Enter to select.</Text>
            </Box>
        </Box>
    );
};
