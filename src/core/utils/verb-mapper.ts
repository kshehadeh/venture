import nlp from 'compromise';
import { ENGINE_GLOBAL_ACTIONS } from '../globals';
import { logger } from '../logger';

/**
 * Map extracted verbs to command IDs using ENGINE_GLOBAL_ACTIONS aliases.
 * Handles verb variations, phrasal verbs, and normalized verb forms.
 */
export class VerbMapper {
    private verbToCommandMap: Map<string, string> = new Map();
    private phrasalVerbMap: Map<string, string> = new Map();

    constructor() {
        this.buildMaps();
    }

    /**
     * Build maps from ENGINE_GLOBAL_ACTIONS aliases to command IDs.
     */
    private buildMaps(): void {
        for (const action of ENGINE_GLOBAL_ACTIONS) {
            const commandId = action.id;
            
            // Map the command ID itself
            this.verbToCommandMap.set(commandId.toLowerCase(), commandId);
            
            // Map all aliases
            if (action.aliases) {
                for (const alias of action.aliases) {
                    const lowerAlias = alias.toLowerCase();
                    
                    // Check if it's a phrasal verb (contains space)
                    if (lowerAlias.includes(' ')) {
                        this.phrasalVerbMap.set(lowerAlias, commandId);
                    } else {
                        this.verbToCommandMap.set(lowerAlias, commandId);
                    }
                }
            }
            
            // Map the text field if it exists
            if (action.text) {
                const lowerText = action.text.toLowerCase();
                if (lowerText.includes(' ')) {
                    this.phrasalVerbMap.set(lowerText, commandId);
                } else {
                    this.verbToCommandMap.set(lowerText, commandId);
                }
            }
        }
        
        // Add common verb variations
        this.addVerbVariations();
        
        logger.log('[VerbMapper] Built maps:', {
            verbMapSize: this.verbToCommandMap.size,
            phrasalVerbMapSize: this.phrasalVerbMap.size
        });
    }

    /**
     * Add common verb variations and synonyms.
     */
    private addVerbVariations(): void {
        // Look variations
        this.verbToCommandMap.set('examine', 'look');
        this.verbToCommandMap.set('inspect', 'look');
        this.verbToCommandMap.set('view', 'look');
        this.verbToCommandMap.set('check', 'look');
        this.verbToCommandMap.set('see', 'look');
        this.phrasalVerbMap.set('look at', 'look');
        this.phrasalVerbMap.set('examine', 'look');
        this.phrasalVerbMap.set('inspect', 'look');
        
        // Pickup variations
        this.verbToCommandMap.set('grab', 'pickup');
        this.verbToCommandMap.set('take', 'pickup');
        this.verbToCommandMap.set('get', 'pickup');
        this.verbToCommandMap.set('collect', 'pickup');
        this.phrasalVerbMap.set('pick up', 'pickup');
        this.phrasalVerbMap.set('pickup', 'pickup');
        
        // Move variations
        this.verbToCommandMap.set('go', 'move');
        this.verbToCommandMap.set('walk', 'move');
        this.verbToCommandMap.set('travel', 'move');
        this.verbToCommandMap.set('head', 'move');
        this.phrasalVerbMap.set('go to', 'move');
        
        // Inventory variations
        this.verbToCommandMap.set('inventory', 'items');
        this.verbToCommandMap.set('inv', 'items');
        this.verbToCommandMap.set('i', 'items');
        this.verbToCommandMap.set('bag', 'items');
        this.verbToCommandMap.set('stuff', 'items');
        
        // Transfer variations
        this.verbToCommandMap.set('switch', 'transfer');
        this.verbToCommandMap.set('swap', 'transfer');
        this.phrasalVerbMap.set('switch to', 'transfer');
        this.phrasalVerbMap.set('transfer to', 'transfer');
        this.phrasalVerbMap.set('move to', 'transfer');
    }

    /**
     * Normalize a verb to its base form (e.g., "picking" -> "pick", "grabbed" -> "grab").
     */
    private normalizeVerb(verb: string): string {
        const doc = nlp(verb);
        // Get the infinitive form
        const infinitive = doc.verbs().toInfinitive().out('text');
        if (infinitive) {
            return infinitive.toLowerCase();
        }
        // Fallback: just lowercase
        return verb.toLowerCase();
    }

    /**
     * Map a verb (or verb phrase) to a command ID.
     * Checks phrasal verbs first, then single verbs.
     * 
     * @param verb The verb or verb phrase to map
     * @returns Command ID or null if no match found
     */
    mapVerbToCommand(verb: string | null): string | null {
        if (!verb) {
            return null;
        }

        const lowerVerb = verb.toLowerCase().trim();
        logger.log(`[VerbMapper] Mapping verb: "${lowerVerb}"`);

        // Check phrasal verbs first (longer matches first)
        const sortedPhrasalVerbs = Array.from(this.phrasalVerbMap.keys())
            .sort((a, b) => b.length - a.length);
        
        for (const phrasalVerb of sortedPhrasalVerbs) {
            if (lowerVerb === phrasalVerb || lowerVerb.startsWith(phrasalVerb + ' ')) {
                const commandId = this.phrasalVerbMap.get(phrasalVerb);
                logger.log(`[VerbMapper] Matched phrasal verb "${phrasalVerb}" to command: ${commandId}`);
                return commandId || null;
            }
        }

        // Check single verbs - try exact match first
        if (this.verbToCommandMap.has(lowerVerb)) {
            const commandId = this.verbToCommandMap.get(lowerVerb);
            logger.log(`[VerbMapper] Matched verb "${lowerVerb}" to command: ${commandId}`);
            return commandId || null;
        }

        // Try normalized form (infinitive)
        const normalized = this.normalizeVerb(lowerVerb);
        if (normalized !== lowerVerb && this.verbToCommandMap.has(normalized)) {
            const commandId = this.verbToCommandMap.get(normalized);
            logger.log(`[VerbMapper] Matched normalized verb "${normalized}" to command: ${commandId}`);
            return commandId || null;
        }

        logger.log(`[VerbMapper] No match found for verb: "${lowerVerb}"`);
        return null;
    }

    /**
     * Check if a verb phrase matches a command (for phrasal verbs).
     * This is useful when the verb phrase includes the target.
     */
    matchPhrasalVerb(input: string): { commandId: string; remainingText: string } | null {
        const lowerInput = input.toLowerCase();
        const sortedPhrasalVerbs = Array.from(this.phrasalVerbMap.keys())
            .sort((a, b) => b.length - a.length);
        
        for (const phrasalVerb of sortedPhrasalVerbs) {
            if (lowerInput.startsWith(phrasalVerb)) {
                const commandId = this.phrasalVerbMap.get(phrasalVerb);
                if (commandId) {
                    const remainingText = input.substring(phrasalVerb.length).trim();
                    return {
                        commandId,
                        remainingText
                    };
                }
            }
        }
        
        return null;
    }
}

// Export singleton instance
let verbMapperInstance: VerbMapper | null = null;

export function getVerbMapper(): VerbMapper {
    if (!verbMapperInstance) {
        verbMapperInstance = new VerbMapper();
    }
    return verbMapperInstance;
}

