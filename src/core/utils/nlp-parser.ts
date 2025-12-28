import nlp from 'compromise';
import { logger } from '../logger';

export interface ParsedCommand {
    verb: string | null;
    target: string | null;
    verbPhrase: string | null; // For phrasal verbs like "pick up"
}

/**
 * Extract verb and target noun from a sentence using NLP.
 * Handles phrasal verbs, multi-word nouns, and various sentence structures.
 */
export function parseCommand(input: string): ParsedCommand {
    logger.log('[NLP Parser] Parsing input:', input);
    
    const cleanInput = input.trim();
    if (!cleanInput) {
        return { verb: null, target: null, verbPhrase: null };
    }

    const doc = nlp(cleanInput);
    
    // Extract verbs - get all verbs including phrasal verbs
    const verbs = doc.verbs();
    const verbText = verbs.out('text');
    
    // Try to find phrasal verbs first (multi-word verbs)
    // Common phrasal verbs in game commands: "pick up", "look at", "go to"
    const phrasalVerbs = [
        'pick up', 'pickup', 'grab', 'take', 'get',
        'look at', 'examine', 'inspect', 'view',
        'go to', 'go', 'move', 'walk', 'travel',
        'put down', 'drop', 'place',
        'switch to', 'transfer to', 'move to'
    ];
    
    let verbPhrase: string | null = null;
    let verb: string | null = null;
    const lowerInput = cleanInput.toLowerCase();
    
    // Check for phrasal verbs first (longer phrases first)
    for (const phrasalVerb of phrasalVerbs.sort((a, b) => b.length - a.length)) {
        if (lowerInput.startsWith(phrasalVerb)) {
            verbPhrase = phrasalVerb;
            verb = phrasalVerb;
            logger.log(`[NLP Parser] Found phrasal verb: "${verbPhrase}"`);
            break;
        }
    }
    
    // If no phrasal verb found, extract single verb
    if (!verb && verbText) {
        // Get the first verb and normalize it
        const firstVerb = verbs.first();
        if (firstVerb) {
            verb = firstVerb.out('text').toLowerCase();
            logger.log(`[NLP Parser] Found verb: "${verb}"`);
        }
    }
    
    // Extract target noun (direct object)
    let target: string | null = null;
    
    // If we found a verb phrase, extract everything after it
    if (verbPhrase) {
        // Find the verb phrase in the original input (case-insensitive search)
        const verbPhraseLower = verbPhrase.toLowerCase();
        const verbPhraseIndex = lowerInput.indexOf(verbPhraseLower);
        if (verbPhraseIndex !== -1) {
            // Calculate where the verb phrase ends
            const verbPhraseEnd = verbPhraseIndex + verbPhraseLower.length;
            // Skip spaces after the verb phrase
            let endPos = verbPhraseEnd;
            while (endPos < lowerInput.length && lowerInput[endPos] === ' ') {
                endPos++;
            }
            // Extract the remaining text preserving original case from cleanInput
            const afterVerb = cleanInput.substring(endPos).trim();
            if (afterVerb) {
                // For short phrases (1-2 words), use directly to preserve case
                const words = afterVerb.split(/\s+/);
                if (words.length <= 2) {
                    // Remove articles and use the remaining text directly
                    // This preserves the original case from the input
                    let cleaned = afterVerb.replace(/^(the|a|an)\s+/i, '').trim();
                    target = cleaned || afterVerb.trim();
                    logger.log(`[NLP Parser] Using short phrase as target: "${target}" (from afterVerb: "${afterVerb}")`);
                } else {
                    // Parse the remaining text to extract noun phrase for longer phrases
                    const remainingDoc = nlp(afterVerb);
                    const nouns = remainingDoc.nouns();
                    if (nouns.length > 0) {
                        // Get the noun phrase text (might be normalized/lowercased)
                        const nounText = nouns.out('text');
                        const nounLower = nounText.toLowerCase().trim();
                        const afterVerbLower = afterVerb.toLowerCase().trim();
                        
                        // If the noun phrase matches the entire remaining text (case-insensitive),
                        // use the original remaining text to preserve case
                        if (afterVerbLower === nounLower || afterVerbLower.endsWith(nounLower)) {
                            // Remove leading articles if present
                            const cleaned = afterVerb.replace(/^(the|a|an)\s+/i, '').trim();
                            target = cleaned.length > 0 ? cleaned : afterVerb.trim();
                        } else {
                            // Try to find and extract the noun phrase from original text
                            const nounIndex = afterVerbLower.indexOf(nounLower);
                            if (nounIndex !== -1) {
                                // Extract from original text preserving case
                                // For multi-word nouns, we need to be careful
                                const words2 = afterVerb.split(/\s+/);
                                const nounWords = nounText.split(/\s+/);
                                
                                // If noun starts at the beginning (after articles), extract those words
                                if (nounIndex === 0 || afterVerbLower.replace(/^(the|a|an)\s+/i, '').startsWith(nounLower)) {
                                    // Remove articles and take the noun words
                                    const withoutArticles = afterVerb.replace(/^(the|a|an)\s+/i, '').trim();
                                    const withoutArticlesWords = withoutArticles.split(/\s+/);
                                    target = withoutArticlesWords.slice(0, nounWords.length).join(' ');
                                } else {
                                    // Extract from the found position
                                    target = afterVerb.substring(nounIndex, nounIndex + nounText.length).trim();
                                }
                            } else {
                                // Fallback: use the remaining text (preserves case)
                                target = afterVerb.trim();
                            }
                        }
                        logger.log(`[NLP Parser] Found target after phrasal verb: "${target}"`);
                    } else {
                        // If no noun found, use the remaining text as-is (preserves case)
                        target = afterVerb.trim();
                        logger.log(`[NLP Parser] Using remaining text as target: "${target}"`);
                    }
                }
            }
        }
    } else if (verb) {
        // For single verbs, find the direct object
        // Get nouns that come after the verb
        const allNouns = doc.nouns();
        if (allNouns.length > 0) {
            // Find nouns that appear after the verb
            const verbIndex = lowerInput.indexOf(verb);
            const nounPhrases = allNouns.out('array');
            
            for (const nounPhrase of nounPhrases) {
                const nounIndex = lowerInput.indexOf(nounPhrase.toLowerCase());
                if (nounIndex > verbIndex) {
                    // Extract from original text to preserve case
                    target = cleanInput.substring(nounIndex, nounIndex + nounPhrase.length);
                    logger.log(`[NLP Parser] Found target after verb: "${target}"`);
                    break;
                }
            }
            
            // If no noun found after verb, try the first noun phrase
            if (!target && nounPhrases.length > 0) {
                const firstNoun = nounPhrases[0];
                const firstNounIndex = lowerInput.indexOf(firstNoun.toLowerCase());
                if (firstNounIndex !== -1) {
                    target = cleanInput.substring(firstNounIndex, firstNounIndex + firstNoun.length);
                } else {
                    target = firstNoun;
                }
                logger.log(`[NLP Parser] Using first noun as target: "${target}"`);
            }
        }
    }
    
    // If no verb found but input exists, might be a single-word command or direction
    if (!verb && cleanInput) {
        // Check if it's a noun (could be a direction or object name)
        const docCheck = nlp(cleanInput);
        const hasVerb = docCheck.verbs().length > 0;
        const hasNoun = docCheck.nouns().length > 0;
        
        if (!hasVerb && hasNoun) {
            // Single noun - might be a direction or object reference
            target = cleanInput;
            logger.log(`[NLP Parser] Input is single noun: "${target}"`);
        }
    }
    
    const result = {
        verb: verb || null,
        target: target || null,
        verbPhrase: verbPhrase || null
    };
    
    logger.log('[NLP Parser] Parsed result:', result);
    return result;
}

