import React from 'react';
import { Box, Text } from 'ink';
import { GameState, GameView } from '../../core/types';

interface VisualsPanelProps {
    state: GameState;
    gameView?: GameView;
}

const ART_LIBRARY: Record<string, string> = {
    intro: `
   (   )
  (   ) (
   ) _ )
  ( (_)
   _(_)_)
  `,
    crossroads: `
      |
    --+--
      |
    `,
    default: `
    [ ? ]
  `
};

export const VisualsPanel: React.FC<VisualsPanelProps> = ({ state, gameView }) => {
    const art = ART_LIBRARY[state.currentSceneId] || ART_LIBRARY.default;
    const player = state.characters.player;
    if (!player) {
        return <Text>Character not found</Text>;
    }
    const { stats, baseStats } = player;

    // Get scene information from gameView
    const exits = gameView?.currentSceneExits || [];
    const objects = gameView?.currentSceneObjects || [];
    const npcs = gameView?.currentSceneNPCs || [];

    // Format exits for display
    const exitsList = exits.length > 0
        ? exits.map(exit => {
            const direction = exit.direction.toUpperCase();
            const name = exit.name ? ` (${exit.name})` : '';
            return `  ${direction}${name} → ${exit.nextSceneId}`;
        }).join('\n')
        : '  (none)';

    // Format objects for display
    const objectsList = objects.length > 0
        ? objects.map(obj => {
            const quantity = obj.quantity && obj.quantity > 1 ? ` (x${obj.quantity})` : '';
            return `  - ${obj.id}${quantity}`;
        }).join('\n')
        : '  (none)';

    // Format NPCs for display
    const npcsList = npcs.length > 0
        ? npcs.map(npc => {
            return `  - ${npc.name}${npc.description ? `: ${npc.description}` : ''}`;
        }).join('\n')
        : '  (none)';

    // Stat labels mapping
    const statLabels: Record<keyof typeof stats, string> = {
        health: 'HP',
        willpower: 'WP',
        perception: 'PER',
        reputation: 'REP',
        strength: 'STR',
        agility: 'AGI'
    };

    // Format stat display: effective (base)
    const formatStat = (statKey: keyof typeof stats) => {
        const effective = stats[statKey];
        const base = baseStats[statKey];
        const label = statLabels[statKey];
        // Only show base in parentheses if it differs from effective
        if (effective !== base) {
            return `${label}: ${effective} (${base})`;
        }
        return `${label}: ${effective}`;
    };

    return (
        <Box flexDirection="column" borderStyle="single" borderColor="blue" width="30%" padding={1}>
            <Box height="25%" justifyContent="center" alignItems="center">
                <Text color="cyan">{art}</Text>
            </Box>
            <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray">
                <Text bold underline>Stats</Text>
                <Text>{formatStat('health')}</Text>
                <Text>{formatStat('willpower')}</Text>
                <Text>{formatStat('perception')}</Text>
                <Text>{formatStat('reputation')}</Text>
                <Text>{formatStat('strength')}</Text>
                <Text>{formatStat('agility')}</Text>
            </Box>
            <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="magenta" flexGrow={1}>
                <Text bold underline color="magenta">Exits</Text>
                <Text color="white">{exitsList}</Text>
            </Box>
            <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="green" flexGrow={1}>
                <Text bold underline color="green">Objects</Text>
                <Text color="white">{objectsList}</Text>
            </Box>
            <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor="yellow" flexGrow={1}>
                <Text bold underline color="yellow">NPCs</Text>
                <Text color="white">{npcsList}</Text>
            </Box>
        </Box>
    );
};
