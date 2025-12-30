import { ChoiceDefinition } from './resolution';

export const ENGINE_GLOBAL_ACTIONS: ChoiceDefinition[] = [
    {
        id: "look",
        text: "Look around",
        aliases: ["search", "l"],
        effects: {
            reprintNarrative: true
        }
    },
    {
        id: "items",
        text: "Check inventory",
        aliases: ["inventory", "inv", "i"],
        effects: {
            listInventory: true
        }
    },
    {
        id: "pickup",
        text: "Pick up",
        aliases: ["pick up", "grab", "take", "get"],
        effects: {} // Handled specially in resolution
    },
    {
        id: "drop",
        text: "Drop item",
        aliases: ["drop", "put down", "discard", "leave"],
        effects: {} // Handled specially in resolution
    },
    {
        id: "move",
        text: "Move",
        aliases: ["go", "walk", "travel"],
        effects: {} // Handled specially in resolution
    },
    {
        id: "transfer",
        text: "Transfer",
        aliases: ["switch", "move"],
        effects: {} // Handled specially in resolution
    },
    {
        id: "help",
        text: "Help",
        aliases: ["?", "commands"],
        effects: {} // Handled specially in resolution
    },
    {
        id: "effects",
        text: "Check effects",
        aliases: ["status", "conditions", "affects"],
        effects: {} // Handled specially in resolution
    },
    {
        id: "query",
        text: "Ask a question",
        aliases: [],
        effects: {} // Handled specially in resolution
    }
];
