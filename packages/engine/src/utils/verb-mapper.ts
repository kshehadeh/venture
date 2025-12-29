import nlp from 'compromise';
import { ENGINE_GLOBAL_ACTIONS } from '../globals';
import { logger } from '../logger';
import { getCommandRegistry } from '../command';
import { Command } from '../commands/base-command';

/**
 * Map extracted verbs to Command objects using ENGINE_GLOBAL_ACTIONS aliases.
 * Handles verb variations, phrasal verbs, and normalized verb forms.
 */
export class VerbMapper {
    private verbToCommandMap: Map<string, Command> = new Map();
    private phrasalVerbMap: Map<string, Command> = new Map();
    private registry = getCommandRegistry();

    constructor() {
        this.buildMaps();
    }

    /**
     * Build maps from ENGINE_GLOBAL_ACTIONS aliases and command registry aliases to Command objects.
     */
    private buildMaps(): void {
        // First, add aliases from ENGINE_GLOBAL_ACTIONS (for backward compatibility)
        for (const action of ENGINE_GLOBAL_ACTIONS) {
            const commandId = action.id;
            const command = this.registry.getCommand(commandId);
            
            if (!command) {
                logger.log(`[VerbMapper] Command ${commandId} not found in registry, skipping`);
                continue;
            }
            
            // Map the command ID itself
            this.verbToCommandMap.set(commandId.toLowerCase(), command);
            
            // Map all aliases
            if (action.aliases) {
                for (const alias of action.aliases) {
                    const lowerAlias = alias.toLowerCase();
                    
                    // Check if it's a phrasal verb (contains space)
                    if (lowerAlias.includes(' ')) {
                        this.phrasalVerbMap.set(lowerAlias, command);
                    } else {
                        this.verbToCommandMap.set(lowerAlias, command);
                    }
                }
            }
            
            // Map the text field if it exists
            if (action.text) {
                const lowerText = action.text.toLowerCase();
                if (lowerText.includes(' ')) {
                    this.phrasalVerbMap.set(lowerText, command);
                } else {
                    this.verbToCommandMap.set(lowerText, command);
                }
            }
        }
        
        // Then, add aliases from command registry (these take precedence)
        const { singleWords, phrasalVerbs } = this.registry.getAllAliases();
        
        // Add single word aliases from commands
        for (const [alias, commandId] of singleWords.entries()) {
            const command = this.registry.getCommand(commandId);
            if (command) {
                this.verbToCommandMap.set(alias, command);
            }
        }
        
        // Add phrasal verb aliases from commands
        for (const [phrasalVerb, commandId] of phrasalVerbs.entries()) {
            const command = this.registry.getCommand(commandId);
            if (command) {
                this.phrasalVerbMap.set(phrasalVerb, command);
            }
        }
        
        logger.log('[VerbMapper] Built maps:', {
            verbMapSize: this.verbToCommandMap.size,
            phrasalVerbMapSize: this.phrasalVerbMap.size
        });
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
     * Map a verb (or verb phrase) to a Command object.
     * Checks phrasal verbs first, then single verbs.
     * 
     * @param verb The verb or verb phrase to map
     * @returns Command object or null if no match found
     */
    mapVerbToCommand(verb: string | null): Command | null {
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
                const command = this.phrasalVerbMap.get(phrasalVerb);
                logger.log(`[VerbMapper] Matched phrasal verb "${phrasalVerb}" to command: ${command?.getCommandId()}`);
                return command || null;
            }
        }

        // Check single verbs - try exact match first
        if (this.verbToCommandMap.has(lowerVerb)) {
            const command = this.verbToCommandMap.get(lowerVerb);
            logger.log(`[VerbMapper] Matched verb "${lowerVerb}" to command: ${command?.getCommandId()}`);
            return command || null;
        }

        // Try normalized form (infinitive)
        const normalized = this.normalizeVerb(lowerVerb);
        if (normalized !== lowerVerb && this.verbToCommandMap.has(normalized)) {
            const command = this.verbToCommandMap.get(normalized);
            logger.log(`[VerbMapper] Matched normalized verb "${normalized}" to command: ${command?.getCommandId()}`);
            return command || null;
        }

        logger.log(`[VerbMapper] No match found for verb: "${lowerVerb}"`);
        return null;
    }

    /**
     * Check if a verb phrase matches a command (for phrasal verbs).
     * This is useful when the verb phrase includes the target.
     */
    matchPhrasalVerb(input: string): { command: Command; remainingText: string } | null {
        const lowerInput = input.toLowerCase();
        const sortedPhrasalVerbs = Array.from(this.phrasalVerbMap.keys())
            .sort((a, b) => b.length - a.length);
        
        for (const phrasalVerb of sortedPhrasalVerbs) {
            if (lowerInput.startsWith(phrasalVerb)) {
                const command = this.phrasalVerbMap.get(phrasalVerb);
                if (command) {
                    const remainingText = input.substring(phrasalVerb.length).trim();
                    return {
                        command,
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

