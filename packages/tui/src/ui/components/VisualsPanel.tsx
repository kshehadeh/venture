import React from 'react';
import { GameState, GameView } from '@venture/engine';

interface VisualsPanelProps {
    state: GameState;
    gameView?: GameView;
}

export function VisualsPanel({ state, gameView }: VisualsPanelProps): React.ReactNode {
    const player = state.characters.player;
    if (!player) {
        return <text>Character not found</text>;
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
        <box style={{ flexDirection: 'column', border: true, borderStyle: 'single', borderColor: 'blue', width: '30%', padding: 1 }}>
            <box style={{ flexDirection: 'column', border: true, borderStyle: 'single', borderColor: 'gray' }}>
                <text><strong><u>Stats</u></strong></text>
                <text>{formatStat('health')}</text>
                <text>{formatStat('willpower')}</text>
                <text>{formatStat('perception')}</text>
                <text>{formatStat('reputation')}</text>
                <text>{formatStat('strength')}</text>
                <text>{formatStat('agility')}</text>
            </box>
            <box style={{ flexDirection: 'column', marginTop: 1, border: true, borderStyle: 'single', borderColor: 'magenta', flexGrow: 1 }}>
                <text fg="magenta"><strong><u>Exits</u></strong></text>
                <text fg="white">{exitsList}</text>
            </box>
            <box style={{ flexDirection: 'column', marginTop: 1, border: true, borderStyle: 'single', borderColor: 'green', flexGrow: 1 }}>
                <text fg="green"><strong><u>Objects</u></strong></text>
                <text fg="white">{objectsList}</text>
            </box>
            <box style={{ flexDirection: 'column', marginTop: 1, border: true, borderStyle: 'single', borderColor: 'yellow', flexGrow: 1 }}>
                <text fg="yellow"><strong><u>NPCs</u></strong></text>
                <text fg="white">{npcsList}</text>
            </box>
        </box>
    );
};
