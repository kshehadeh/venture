import React, { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { GameManifest } from '../../core/types';
import type { KeyEvent } from '@opentui/core';

interface GameSelectorProps {
    games: GameManifest[];
    onSelect: (gameId: string) => void;
}

export const GameSelector: React.FC<GameSelectorProps> = ({ games, onSelect }) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useKeyboard((key: KeyEvent) => {
        if (key.name === 'up' || key.name === 'k') { // Vim bindings support ;)
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : games.length - 1));
        }
        if (key.name === 'down' || key.name === 'j') {
            setSelectedIndex(prev => (prev < games.length - 1 ? prev + 1 : 0));
        }
        if (key.name === 'return' || key.name === 'enter') {
            onSelect(games[selectedIndex].id);
        }
    });

    return (
        <box flexDirection="column" borderStyle="single" borderColor="cyan" padding={1} width="100%" height="100%">
            <box marginBottom={1} justifyContent="center">
                <text bold color="cyan">Select a Game</text>
            </box>

            <box flexDirection="column" flexGrow={1}>
                {games.map((game, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                        <box key={game.id} flexDirection="column" paddingY={0} paddingX={1} borderStyle={isSelected ? 'single' : undefined} borderColor="yellow">
                            <text color={isSelected ? 'yellow' : 'white'} bold={isSelected}>
                                {isSelected ? '> ' : '  '} {game.name}
                            </text>
                            <text color="gray" dimColor>
                                {'    ' + game.description}
                            </text>
                        </box>
                    );
                })}
            </box>

            <box marginTop={1}>
                <text color="gray">Use ↑/↓ to navigate, Enter to select.</text>
            </box>
        </box>
    );
};
