import React, { useState } from 'react';
import { useKeyboard } from '@opentui/react';
import { GameManifest } from '@venture/engine';

interface GameSelectorProps {
    games: GameManifest[];
    onSelect: (gameId: string) => void;
}

export function GameSelector({ games, onSelect }: GameSelectorProps): React.ReactNode {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useKeyboard((key) => {
        if (key.name === 'up' || key.name === 'k') { // Vim bindings support ;)
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : games.length - 1));
        }
        if (key.name === 'down' || key.name === 'j') {
            setSelectedIndex(prev => (prev < games.length - 1 ? prev + 1 : 0));
        }
        if (key.name === 'return') {
            onSelect(games[selectedIndex].id);
        }
    });

    return (
        <box style={{ flexDirection: 'column', border: true, borderStyle: 'single', borderColor: 'cyan', padding: 1, width: '100%', height: '100%' }}>
            <box style={{ marginBottom: 1, justifyContent: 'center' }}>
                <text fg="cyan"><strong>Select a Game</strong></text>
            </box>

            <box style={{ flexDirection: 'column', flexGrow: 1 }}>
                {games.map((game, idx) => {
                    const isSelected = idx === selectedIndex;
                    return (
                        <box key={game.id} style={{ flexDirection: 'column', padding: 1, paddingTop: 0, paddingBottom: 0, border: isSelected, borderStyle: isSelected ? 'single' : undefined, borderColor: 'yellow' }}>
                            <text fg={isSelected ? 'yellow' : 'white'}>
                                {isSelected ? <strong>{'> '} {game.name}</strong> : `  ${game.name}`}
                            </text>
                            <text fg="gray">
                                {'    ' + game.description}
                            </text>
                        </box>
                    );
                })}
            </box>

            <box style={{ marginTop: 1 }}>
                <text fg="gray">Use ↑/↓ to navigate, Enter to select.</text>
            </box>
        </box>
    );
};
