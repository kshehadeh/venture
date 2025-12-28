import React from 'react';
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
        return <text>Character not found</text>;
    }
    const { stats } = player;

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

    return (
        <box flexDirection="column" borderStyle="single" borderColor="blue" width="30%" padding={1}>
            <box height="25%" justifyContent="center" alignItems="center">
                <text color="cyan">{art}</text>
            </box>
            <box flexDirection="column" marginTop={1} borderStyle="single" borderColor="gray">
                <text bold underline>Stats</text>
                <text>HP: {stats.health}</text>
                <text>WP: {stats.willpower}</text>
                <text>PER: {stats.perception}</text>
            </box>
            <box flexDirection="column" marginTop={1} borderStyle="single" borderColor="magenta" flexGrow={1}>
                <text bold underline color="magenta">Exits</text>
                <text wrap="wrap" color="white">{exitsList}</text>
            </box>
            <box flexDirection="column" marginTop={1} borderStyle="single" borderColor="green" flexGrow={1}>
                <text bold underline color="green">Objects</text>
                <text wrap="wrap" color="white">{objectsList}</text>
            </box>
            <box flexDirection="column" marginTop={1} borderStyle="single" borderColor="yellow" flexGrow={1}>
                <text bold underline color="yellow">NPCs</text>
                <text wrap="wrap" color="white">{npcsList}</text>
            </box>
        </box>
    );
};
