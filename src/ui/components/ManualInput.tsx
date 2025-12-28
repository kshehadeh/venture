import React, { useState, useEffect } from 'react';
import { useKeyboard } from '@opentui/react';
import { TextAttributes, type KeyEvent } from '@opentui/core';

interface ManualInputProps {
    onSubmit: (value: string) => void;
    isProcessing?: boolean;
}

export const ManualInput: React.FC<ManualInputProps> = ({ onSubmit, isProcessing }) => {
    const [query, setQuery] = useState('');

    // Clear query after submit success? 
    // We don't know success here easily without prop change or callback.
    // Actually, we clear immediately on submit in the handler below.

    useKeyboard((key: KeyEvent) => {
        // Block input while processing
        if (isProcessing) return;

        if (key.name === 'return' || key.name === 'enter') {
            if (query.trim().length > 0) {
                onSubmit(query);
                setQuery('');
            }
            return;
        }

        if (key.name === 'backspace') {
            setQuery(prev => prev.slice(0, -1));
            return;
        }

        if (key.name === 'space') {
            setQuery(prev => prev + ' ');
            return;
        }

        // Filter control keys and ensure single character
        if (!key.ctrl && !key.meta && !key.option && key.sequence && key.sequence.length === 1) {
            if (key.sequence.charCodeAt(0) >= 32) {
                setQuery(prev => prev + key.sequence);
            }
        }
    });

    return (
        <box borderStyle="single" borderColor={isProcessing ? "yellow" : "green"} flexDirection="row" paddingLeft={1}>
            <text fg={isProcessing ? "yellow" : "green"} attributes={TextAttributes.BOLD}>{'> '}</text>
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
