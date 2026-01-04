import React, { useState } from 'react';
import { useKeyboard } from '@opentui/react';

interface ManualInputProps {
    onSubmit: (value: string) => void;
    isProcessing?: boolean;
    conversationContext?: { type: 'conversation'; npcIds: string[]; sceneId: string };
    npcs?: Array<{ id: string; name: string }>;
}

export function ManualInput({ onSubmit, isProcessing, conversationContext, npcs }: ManualInputProps): React.ReactNode {
    const [query, setQuery] = useState('');
    
    // Get prompt text based on context
    let promptText = '> ';
    if (conversationContext && npcs && conversationContext.npcIds.length > 0) {
        const npcId = conversationContext.npcIds[0];
        const npc = npcs.find(n => n.id === npcId);
        const npcName = npc?.name || npcId;
        promptText = `Say to ${npcName}: `;
    }

    useKeyboard((key) => {
        // Block input while processing
        if (isProcessing) return;

        if (key.name === 'return') {
            if (query.trim().length > 0) {
                onSubmit(query);
                setQuery('');
            }
            return;
        }

        if (key.name === 'backspace' || key.name === 'delete') {
            setQuery(prev => prev.slice(0, -1));
            return;
        }

        // Handle space key
        if (key.name === 'space') {
            setQuery(prev => prev + ' ');
            return;
        }

        // Handle regular character input - key.name might be the character for regular keys
        // Check if it's a single character and not a special key
        if (key.name && key.name.length === 1 && !key.ctrl && !key.meta && 
            key.name !== 'up' && key.name !== 'down' && key.name !== 'left' && key.name !== 'right' &&
            key.name !== 'return' && key.name !== 'escape' && key.name !== 'tab' && key.name !== 'space') {
            setQuery(prev => prev + key.name);
        }
    });

    return (
        <box style={{ border: true, borderStyle: 'single', borderColor: isProcessing ? "yellow" : "green", flexDirection: 'row', paddingLeft: 1 }}>
            <text fg={isProcessing ? "yellow" : "green"}><strong>{promptText}</strong></text>
            {isProcessing ? (
                <text fg="gray">Processing...</text>
            ) : (
                <>
                    <text>{query}</text>
                    <text fg="gray">_</text>
                </>
            )}
        </box>
    );
};
