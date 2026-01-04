import React from 'react';
import { ManualInput } from './ManualInput';

interface InputPanelProps {
    onSubmit: (value: string) => void;
    isProcessing?: boolean;
    conversationContext?: { type: 'conversation'; npcIds: string[]; sceneId: string };
    npcs?: Array<{ id: string; name: string }>;
}

// ManualInput already accepts InputPanelProps which includes isProcessing!
export function InputPanel(props: InputPanelProps): React.ReactNode {
    return <ManualInput {...props} />;
}
