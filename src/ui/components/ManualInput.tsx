import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface ManualInputProps {
    onSubmit: (value: string) => void;
    isProcessing?: boolean;
}

export const ManualInput: React.FC<ManualInputProps> = ({ onSubmit, isProcessing }) => {
    const [query, setQuery] = useState('');

    useInput((input, key) => {
        // Block input while processing
        if (isProcessing) return;

        if (key.return) {
            if (query.trim().length > 0) {
                onSubmit(query);
                setQuery('');
            }
            return;
        }

        if (key.backspace || key.delete || key.backspace) {
            setQuery(prev => prev.slice(0, -1));
            return;
        }

        // Handle regular character input
        if (input && !key.ctrl && !key.meta && !key.meta) {
            setQuery(prev => prev + input);
        }
    });

    return (
        <Box borderStyle="single" borderColor={isProcessing ? "yellow" : "green"} flexDirection="row" paddingLeft={1}>
            <Text color={isProcessing ? "yellow" : "green"} bold>{'> '}</Text>
            {isProcessing ? (
                <Text color="gray">Processing...</Text>
            ) : (
                <>
                    <Text>{query}</Text>
                    <Text color="gray">_</Text>
                </>
            )}
        </Box>
    );
};
