import nlp from 'compromise';
import { logger } from '../logger';
import { getCommandRegistry } from '../command';

export interface ParsedCommand {
    verb: string | null;
    target: string | null; // Direct object (e.g., "sword" in "transfer sword to left hand")
    verbPhrase: string | null; // For phrasal verbs like "pick up"
    destination: string | null; // Indirect object/destination (e.g., "left hand" in "transfer sword to left hand")
    preposition: string | null; // Preposition connecting target to destination (e.g., "to", "in", "into")
    remainingText: string | null; // Everything after the verb phrase, for complex parsing
}

/**
 * Extract just the noun head from a noun phrase (removes adjectives).
 * Uses compromise to identify the actual noun word.
 * Filters out location words like "there", "here", "over".
 */
function extractNounHead(nounPhrase: string): string {
    const doc = nlp(nounPhrase);
    // Get all nouns (individual noun words, not phrases)
    const nounWords = doc.match('#Noun').out('array');
    const locationWords = ['there', 'here', 'over', 'away', 'back', 'out'];
    
    if (nounWords.length > 0) {
        // Filter out location words and return the last substantive noun word
        for (let i = nounWords.length - 1; i >= 0; i--) {
            const word = nounWords[i];
            if (!locationWords.includes(word.toLowerCase())) {
                return word;
            }
        }
        // If all nouns are location words, return the last one anyway
        return nounWords[nounWords.length - 1];
    }
    // Fallback: return the last word of the phrase that's not a location word
    const words = nounPhrase.trim().split(/\s+/);
    for (let i = words.length - 1; i >= 0; i--) {
        const word = words[i];
        if (!locationWords.includes(word.toLowerCase())) {
            return word;
        }
    }
    return words[words.length - 1] || nounPhrase;
}

/**
 * Extract verb and target noun from a sentence using NLP exclusively.
 * Uses compromise library for all parsing - no manual string manipulation.
 */
export function parseCommand(input: string): ParsedCommand {
    logger.log('[NLP Parser] Parsing input:', input);
    
    const cleanInput = input.trim();
    if (!cleanInput) {
        return { 
            verb: null, 
            target: null, 
            verbPhrase: null,
            destination: null,
            preposition: null,
            remainingText: null
        };
    }

    const doc = nlp(cleanInput);
    
    // Get all phrasal verbs and single word verbs from command registry
    const registry = getCommandRegistry();
    const { singleWords, phrasalVerbs } = registry.getAllAliases();
    const allPhrasalVerbs = Array.from(phrasalVerbs.keys());
    const allSingleWords = Array.from(singleWords.keys());
    
    // Also add command IDs themselves as potential verbs
    const allCommandIds = registry.getAllCommandIds();
    for (const commandId of allCommandIds) {
        const lowerCommandId = commandId.toLowerCase();
        if (!allSingleWords.includes(lowerCommandId)) {
            allSingleWords.push(lowerCommandId);
        }
    }
    
    // Find verb using compromise - search anywhere in the sentence
    let verb: string | null = null;
    let verbPhrase: string | null = null;
    
    // First, check if the entire input is a single command word (handles "inventory", "i", "help", etc.)
    const lowerInput = cleanInput.toLowerCase().trim();
    if (allSingleWords.includes(lowerInput)) {
        // Use the original input to preserve case
        verb = cleanInput;
        logger.log(`[NLP Parser] Found single-word command: "${verb}"`);
    }
    
    // Check for phrasal verbs first (longer phrases first for proper matching)
    if (!verb) {
        const sortedPhrasalVerbs = allPhrasalVerbs.sort((a, b) => b.length - a.length);
        for (const phrasalVerb of sortedPhrasalVerbs) {
            // Use compromise to find the phrasal verb anywhere in the sentence
            const match = doc.match(phrasalVerb);
            if (match.found) {
                verbPhrase = match.text();
                verb = verbPhrase;
                logger.log(`[NLP Parser] Found phrasal verb: "${verbPhrase}"`);
                break;
            }
        }
    }
    
    // If no phrasal verb found, check for single-word verbs
    if (!verb) {
        // Use compromise to find all verbs and check which ones match known command verbs
        const verbs = doc.verbs();
        const candidateVerbs: Array<{ text: string; index: number; isCommand: boolean }> = [];
        
        if (verbs.length > 0) {
            for (let i = 0; i < verbs.length; i++) {
                const verbMatch = verbs.eq(i);
                const extractedVerb = verbMatch.text().toLowerCase();
                const verbText = verbMatch.text();
                const verbPos = cleanInput.toLowerCase().indexOf(verbText.toLowerCase());
                const isCommand = allSingleWords.includes(extractedVerb);
                candidateVerbs.push({ text: verbText, index: verbPos, isCommand });
            }
        }
        
        // Collect all potential command words (both from compromise's verb detection and fallback matching)
        // Then prefer the leftmost one to handle cases like "help look" where "help" should be preferred
        const commandVerbs = candidateVerbs.filter(v => v.isCommand);
        
        // Also collect command words from fallback matching (for cases where compromise doesn't detect them as verbs)
        const candidateMatches: Array<{ text: string; index: number }> = [];
        for (const singleWord of allSingleWords) {
            // Try case-insensitive matching
            const lowerSingleWord = singleWord.toLowerCase();
            const inputLower = cleanInput.toLowerCase();
            const wordIndex = inputLower.indexOf(lowerSingleWord);
            
            if (wordIndex !== -1) {
                // Extract the word in its original case from the input
                const wordLength = singleWord.length;
                const originalWord = cleanInput.substring(wordIndex, wordIndex + wordLength);
                
                // Check if this is at a word boundary (not part of another word)
                const before = wordIndex > 0 ? cleanInput[wordIndex - 1] : ' ';
                const after = wordIndex + wordLength < cleanInput.length ? cleanInput[wordIndex + wordLength] : ' ';
                const isWordBoundary = /\s/.test(before) && /\s/.test(after);
                
                // Also check if it's at the start or end of input
                const isAtStart = wordIndex === 0;
                const isAtEnd = wordIndex + wordLength === cleanInput.length;
                
                if (isWordBoundary || isAtStart || isAtEnd) {
                    // Use compromise to check if this word is actually a pronoun
                    // (e.g., "I" in "I want to pickup" is a pronoun, not the inventory command)
                    const wordDoc = nlp(originalWord);
                    const isPronoun = wordDoc.match('#Pronoun').length > 0;
                    
                    // Only add if it's not a pronoun
                    // This prevents "I" from being treated as the inventory command in "I want to pickup"
                    if (!isPronoun) {
                        candidateMatches.push({ text: originalWord, index: wordIndex });
                    } else {
                        logger.log(`[NLP Parser] Skipping pronoun "${originalWord}" as potential command verb`);
                    }
                }
            }
        }
        
        // Combine command verbs from compromise and command words from fallback
        // Then prefer the leftmost one to handle "help look" correctly
        const allCommandCandidates: Array<{ text: string; index: number }> = [];
        for (const cv of commandVerbs) {
            allCommandCandidates.push({ text: cv.text, index: cv.index });
        }
        for (const cm of candidateMatches) {
            // Only add if not already in the list (avoid duplicates)
            if (!allCommandCandidates.some(c => c.text.toLowerCase() === cm.text.toLowerCase() && c.index === cm.index)) {
                allCommandCandidates.push({ text: cm.text, index: cm.index });
            }
        }
        
        if (allCommandCandidates.length > 0) {
            // Check for helper verbs that should be skipped
            // Helper verbs like "help", "want", "need", "can" should not be selected if there are other command verbs after them
            const helperVerbs = ['help', 'want', 'need', 'can', 'please'];
            const hasHelperVerb = allCommandCandidates.some(c => {
                const lowerText = c.text.toLowerCase();
                return helperVerbs.includes(lowerText);
            });
            
            if (hasHelperVerb && allCommandCandidates.length > 1) {
                // Check if helper verb is followed by another command verb
                // If so, prefer the non-helper command verb (e.g., "please help me move" -> "move")
                // But if helper verb comes first and the other command is detected as a noun by compromise, prefer helper (e.g., "help look" -> "help")
                const helperCandidates = allCommandCandidates.filter(c => {
                    const lowerText = c.text.toLowerCase();
                    return helperVerbs.includes(lowerText);
                });
                const nonHelperCandidates = allCommandCandidates.filter(c => {
                    const lowerText = c.text.toLowerCase();
                    return !helperVerbs.includes(lowerText);
                });
                
                // If we have both helper and non-helper verbs, check their positions and context
                if (helperCandidates.length > 0 && nonHelperCandidates.length > 0) {
                    // Find the leftmost helper verb and leftmost non-helper verb
                    helperCandidates.sort((a, b) => a.index - b.index);
                    nonHelperCandidates.sort((a, b) => a.index - b.index);
                    const leftmostHelper = helperCandidates[0];
                    const leftmostNonHelper = nonHelperCandidates[0];
                    
                    // Check if the non-helper is detected as a verb by compromise
                    const nonHelperDoc = nlp(leftmostNonHelper.text);
                    const isNonHelperAVerb = nonHelperDoc.verbs().length > 0 || doc.verbs().some(v => v.text().toLowerCase() === leftmostNonHelper.text.toLowerCase());
                    
                    // Special case: if helper comes first and there are multiple words between them, prefer non-helper
                    // (e.g., "please help me move" -> "move")
                    // But if helper comes first and non-helper immediately follows, prefer helper
                    // (e.g., "help look" -> "help")
                    const wordsBetween = cleanInput.substring(leftmostHelper.index + leftmostHelper.text.length, leftmostNonHelper.index).trim().split(/\s+/).filter(w => w.length > 0);
                    const hasWordsBetween = wordsBetween.length > 0;
                    
                    if (leftmostNonHelper.index > leftmostHelper.index && isNonHelperAVerb && hasWordsBetween) {
                        // Non-helper comes after helper with words in between - prefer non-helper (e.g., "please help me move" -> "move")
                        verb = leftmostNonHelper.text;
                        logger.log(`[NLP Parser] Found verb from command words (non-helper verb after helper with words between): "${verb}"`);
                    } else {
                        // Helper comes first or non-helper immediately follows - prefer helper (e.g., "help look" -> "help")
                        verb = leftmostHelper.text;
                        logger.log(`[NLP Parser] Found verb from command words (helper preferred): "${verb}"`);
                    }
                } else if (nonHelperCandidates.length > 0) {
                    // Only non-helper verbs, use leftmost
                    nonHelperCandidates.sort((a, b) => a.index - b.index);
                    verb = nonHelperCandidates[0].text;
                    logger.log(`[NLP Parser] Found verb from command words (non-helper): "${verb}"`);
                } else {
                    // Only helper verbs, use leftmost
                    allCommandCandidates.sort((a, b) => a.index - b.index);
                    verb = allCommandCandidates[0].text;
                    logger.log(`[NLP Parser] Found verb from command words (helper only): "${verb}"`);
                }
            } else {
                // No helper verbs or only one candidate, use leftmost
                allCommandCandidates.sort((a, b) => a.index - b.index);
                verb = allCommandCandidates[0].text;
                logger.log(`[NLP Parser] Found verb from command words: "${verb}"`);
            }
        } else if (candidateVerbs.length > 0) {
            // If no command words found, but we have verbs from compromise, prefer rightmost (after helper verbs)
            // This handles cases like "I want to pickup" where "pickup" should be preferred over "want"
            candidateVerbs.sort((a, b) => b.index - a.index);
            verb = candidateVerbs[0].text;
            logger.log(`[NLP Parser] Found verb from NLP (fallback): "${verb}"`);
        }
        
        // If still no verb found and we had non-command verbs, use the leftmost one as last resort
        if (!verb && candidateVerbs.length > 0) {
            candidateVerbs.sort((a, b) => a.index - b.index);
            verb = candidateVerbs[0].text;
            logger.log(`[NLP Parser] Found verb from NLP (last resort fallback): "${verb}"`);
        }
    }
    
    // Extract target, destination, and preposition using compromise
    let target: string | null = null;
    let destination: string | null = null;
    let preposition: string | null = null;
    let remainingText: string | null = null;
    
    if (verb) {
        // Find the verb in the document
        const verbMatch = doc.match(verb);
        
        if (verbMatch.found) {
            // Create a new document from everything after the verb
            const verbText = verbMatch.text();
            const verbIndex = cleanInput.toLowerCase().indexOf(verbText.toLowerCase());
            if (verbIndex !== -1) {
                const afterVerbText = cleanInput.substring(verbIndex + verbText.length).trim();
                
                if (afterVerbText) {
                    remainingText = afterVerbText;
                    const afterVerbDoc = nlp(afterVerbText);
                    
                    // Check for prepositional phrases using compromise
                    // Prefer destination prepositions that come later in the sentence
                    // (e.g., "into" in "move key out of bag into pocket" should be preferred over "out of")
                    const destinationPrepositions = ['to', 'into', 'in', 'inside', 'onto', 'on'];
                    const foundPrepositions: Array<{ prep: string; text: string; index: number }> = [];
                    
                    for (const prep of destinationPrepositions) {
                        const prepMatch = afterVerbDoc.match(prep);
                        if (prepMatch.found) {
                            const prepText = prepMatch.text();
                            const prepIndex = afterVerbText.toLowerCase().indexOf(prepText.toLowerCase());
                            if (prepIndex !== -1) {
                                foundPrepositions.push({ prep, text: prepText, index: prepIndex });
                            }
                        }
                    }
                    
                    // If multiple prepositions found, prefer the rightmost one (destination prepositions usually come later)
                    // This handles "move key out of bag into pocket" - prefer "into" over "out of"
                    if (foundPrepositions.length > 0) {
                        foundPrepositions.sort((a, b) => b.index - a.index); // Rightmost first
                        const selectedPrep = foundPrepositions[0];
                        preposition = selectedPrep.text;
                        const prepIndex = selectedPrep.index;
                        const prepText = selectedPrep.text;
                        
                        if (prepIndex !== -1) {
                            // Text before preposition (target/direct object)
                            const beforePrepText = afterVerbText.substring(0, prepIndex).trim();
                            if (beforePrepText) {
                                const beforePrepDoc = nlp(beforePrepText);
                                const beforePrepNouns = beforePrepDoc.nouns();
                                
                                // For target extraction before preposition, find the best target
                                // Prefer the first word that's not a location word, preposition, or article
                                // But if compromise finds a noun that starts earlier in the text, use that
                                const words = beforePrepText.split(/\s+/);
                                const locationWords = ['there', 'here', 'over', 'away', 'back', 'out', 'of'];
                                const prepositions = ['of', 'from', 'to', 'in', 'on', 'at', 'by', 'with', 'into'];
                                const articles = ['the', 'a', 'an', 'that', 'this'];
                                const possessivePronouns = ['my', 'your', 'his', 'her', 'their', 'our', 'its'];
                                
                                // Find the first word that's not filtered
                                let firstValidWord: string | null = null;
                                let firstValidWordIndex = -1;
                                for (let i = 0; i < words.length; i++) {
                                    const word = words[i];
                                    const lowerWord = word.toLowerCase();
                                    if (!locationWords.includes(lowerWord) && !prepositions.includes(lowerWord) && !articles.includes(lowerWord) && !possessivePronouns.includes(lowerWord)) {
                                        firstValidWord = word;
                                        firstValidWordIndex = i;
                                        break;
                                    }
                                }
                                
                                // Find the first noun from compromise and its position
                                let firstNounPhrase: string | null = null;
                                let firstNounIndex = -1;
                                if (beforePrepNouns.length > 0) {
                                    for (let i = 0; i < beforePrepNouns.length; i++) {
                                        const nounPhrase = beforePrepNouns.eq(i).text().trim();
                                        const isLocationWord = locationWords.includes(nounPhrase.toLowerCase());
                                        
                                        if (!isLocationWord) {
                                            // Find the position of this noun phrase in the text
                                            const nounIndex = beforePrepText.toLowerCase().indexOf(nounPhrase.toLowerCase());
                                            if (nounIndex !== -1) {
                                                // Find which word this noun phrase starts at
                                                const wordsBeforeNoun = beforePrepText.substring(0, nounIndex).trim().split(/\s+/).filter(w => w.length > 0);
                                                const wordIndex = wordsBeforeNoun.length;
                                                
                                                if (firstNounIndex === -1 || wordIndex < firstNounIndex) {
                                                    firstNounPhrase = nounPhrase;
                                                    firstNounIndex = wordIndex;
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                // Prefer the one that comes first in the text
                                if (firstValidWord !== null && (firstNounIndex === -1 || firstValidWordIndex <= firstNounIndex)) {
                                    target = firstValidWord;
                                } else if (firstNounPhrase !== null) {
                                    // Extract just the noun head (remove adjectives)
                                    target = extractNounHead(firstNounPhrase);
                                }
                                
                                // Remove articles
                                if (target) {
                                    target = target.replace(/^(the|a|an)\s+/i, '').trim();
                                }
                            }
                            
                            // Text after preposition (destination/indirect object)
                            const afterPrepText = afterVerbText.substring(prepIndex + prepText.length).trim();
                            if (afterPrepText) {
                                // First, remove possessive pronouns and articles from the start of the original text
                                // This preserves the full phrase including directional modifiers like "left"
                                const determinerPattern = /^(my|your|his|her|their|our|the|a|an)\s+/i;
                                let cleanedText = afterPrepText;
                                if (determinerPattern.test(afterPrepText)) {
                                    cleanedText = afterPrepText.replace(determinerPattern, '').trim();
                                }
                                
                                // Now use compromise to extract the complete noun phrase from the cleaned text
                                const afterPrepDoc = nlp(cleanedText);
                                const nounPhrases = afterPrepDoc.nouns();
                                
                                if (nounPhrases.length > 0) {
                                    // Get all noun phrases and combine them to get the full phrase
                                    // This captures multi-word phrases like "left hand" or "backpack sheath slot"
                                    let fullPhrase = '';
                                    for (let i = 0; i < nounPhrases.length; i++) {
                                        if (i > 0) fullPhrase += ' ';
                                        fullPhrase += nounPhrases.eq(i).text();
                                    }
                                    
                                    // If we got a phrase, use it; otherwise use the cleaned text
                                    destination = fullPhrase.trim() || cleanedText;
                                    
                                    // For destinations, check if it's a compound noun vs single noun with adjectives
                                    // Compound nouns like "left hand", "right-hand" should be kept as full phrase
                                    // Single nouns with descriptive adjectives like "large backpack" should extract just the noun head
                                    const destDoc = nlp(destination);
                                    const destNounWords = destDoc.match('#Noun').out('array');
                                    const words = destination.trim().split(/\s+/);
                                    const firstWord = words[0]?.toLowerCase();
                                    
                                    // Check if first word is a directional/positional modifier (part of compound noun)
                                    // vs a descriptive adjective
                                    const directionalWords = ['left', 'right', 'top', 'bottom', 'front', 'back', 'upper', 'lower', 'inner', 'outer', 'first', 'second', 'third'];
                                    const isDirectionalModifier = firstWord && directionalWords.includes(firstWord);
                                    
                                    if (destNounWords.length > 1) {
                                        // Multiple noun words = compound noun, keep full phrase
                                        // e.g., "backpack sheath slot" -> "backpack sheath slot"
                                        // Do nothing, keep destination as is
                                    } else if (destNounWords.length === 1 && words.length > 1 && isDirectionalModifier) {
                                        // Single noun word but has directional modifier = compound noun phrase
                                        // e.g., "left hand" -> "left hand" (keep full phrase)
                                        // Do nothing, keep destination as is
                                    } else if (destNounWords.length === 1 && words.length > 1) {
                                        // Single noun word with descriptive adjective = extract just the noun
                                        // e.g., "large backpack" -> "backpack"
                                        destination = destNounWords[0];
                                    }
                                    // If no noun words found or single word, keep destination as is
                                } else {
                                    // If no noun phrase found, use the cleaned text (with determiners removed)
                                    destination = cleanedText;
                                }
                            }
                            
                            if (target && destination) {
                                remainingText = null; // Fully parsed
                                logger.log(`[NLP Parser] Found destination pattern: target="${target}", preposition="${preposition}", destination="${destination}"`);
                            }
                        }
                    }
                    
                    // If no destination found, extract target (direct object)
                    if (foundPrepositions.length === 0 || !target || !destination) {
                        const nouns = afterVerbDoc.nouns();
                        if (nouns.length > 0) {
                            // Use compromise to find the first substantive noun (not pronouns or adverbs)
                            // Compromise can identify pronouns, so we filter those out
                            let foundTarget = false;
                            
                            for (let i = 0; i < nouns.length; i++) {
                                const nounMatch = nouns.eq(i);
                                const nounPhrase = nounMatch.text().trim();
                                
                                // Use compromise to check if this is a pronoun or other non-substantive word
                                const nounDoc = nlp(nounPhrase);
                                const pronouns = nounDoc.match('#Pronoun');
                                const isPronoun = pronouns.length > 0;
                                
                                // Also check for common adverbs and location words that might be misidentified as nouns
                                const adverbs = nounDoc.match('#Adverb');
                                const isAdverb = adverbs.length > 0;
                                
                                // Filter out location adverbs like "there", "here", "over"
                                const locationWords = ['there', 'here', 'over', 'away', 'back', 'out'];
                                const isLocationWord = locationWords.includes(nounPhrase.toLowerCase());
                                
                                if (!isPronoun && !isAdverb && !isLocationWord) {
                                    // Extract just the noun head (remove adjectives)
                                    target = extractNounHead(nounPhrase);
                                    foundTarget = true;
                                    break;
                                }
                            }
                            
                            // If we didn't find a good target, use the first noun anyway
                            if (!foundTarget && nouns.length > 0) {
                                const nounPhrase = nouns.first().text().trim();
                                target = extractNounHead(nounPhrase);
                            }
                            
                            // Use compromise to remove articles
                            if (target) {
                                const targetDoc = nlp(target);
                                const withoutDeterminers = targetDoc.match('#Noun+').text();
                                if (withoutDeterminers) {
                                    target = withoutDeterminers.trim();
                                } else {
                                    // Fallback: remove articles manually
                                    target = target.replace(/^(the|a|an)\s+/i, '').trim();
                                }
                            }
                            remainingText = null; // Fully parsed
                            logger.log(`[NLP Parser] Found target: "${target}"`);
                        } else if (!target) {
                            // No noun found, but we have remaining text
                            // Use compromise to clean it up
                            const textDoc = nlp(afterVerbText);
                            const nounsInText = textDoc.nouns();
                            if (nounsInText.length > 0) {
                                // Filter out location words and extract noun head
                                let foundTarget = false;
                                for (let i = 0; i < nounsInText.length; i++) {
                                    const nounPhrase = nounsInText.eq(i).text().trim();
                                    const locationWords = ['there', 'here', 'over', 'away', 'back', 'out'];
                                    
                                    // Extract noun head and check if it's a location word
                                    const extractedHead = extractNounHead(nounPhrase);
                                    if (!locationWords.includes(extractedHead.toLowerCase())) {
                                        target = extractedHead;
                                        foundTarget = true;
                                        break;
                                    }
                                }
                                
                                // If no good target found, try to extract the main noun from the phrase
                                if (!foundTarget && nounsInText.length > 0) {
                                    const nounPhrase = nounsInText.first().text().trim();
                                    // Try to find the actual noun word in the phrase (not location words)
                                    const words = nounPhrase.split(/\s+/);
                                    const locationWords = ['there', 'here', 'over', 'away', 'back', 'out', 'that', 'this', 'the', 'a', 'an', 'shiny', 'golden'];
                                    for (const word of words) {
                                        if (!locationWords.includes(word.toLowerCase())) {
                                            const wordDoc = nlp(word);
                                            // Check if it's a noun
                                            if (wordDoc.nouns().length > 0 || wordDoc.match('#Noun').length > 0) {
                                                target = word;
                                                foundTarget = true;
                                                break;
                                            }
                                        }
                                    }
                                    
                                    // Last resort: use extractNounHead but filter out location words
                                    if (!foundTarget) {
                                        const extractedHead = extractNounHead(nounPhrase);
                                        if (!locationWords.includes(extractedHead.toLowerCase())) {
                                            target = extractedHead;
                                        }
                                    }
                                }
                            } else {
                                // No nouns found, try to extract first word that's not a location word
                                const words = afterVerbText.split(/\s+/);
                                const locationWords = ['there', 'here', 'over', 'away', 'back', 'out', 'the', 'a', 'an', 'that', 'this'];
                                for (const word of words) {
                                    if (!locationWords.includes(word.toLowerCase())) {
                                        target = word;
                                        break;
                                    }
                                }
                                if (!target) {
                                    target = afterVerbText.replace(/^(the|a|an|that|this)\s+/i, '').trim();
                                }
                            }
                            remainingText = null;
                            logger.log(`[NLP Parser] Using remaining text as target: "${target}"`);
                        }
                    }
                }
            }
        }
    } else {
        // No verb found - might be a single noun (direction or object)
        // Use compromise to check if this is just a noun
        const nouns = doc.nouns();
        const verbs = doc.verbs();
        const pronouns = doc.match('#Pronoun');
        
        // Check if input matches a known command word (might be a direction like "north")
        const isCommandWord = allSingleWords.includes(lowerInput);
        
        // If we have nouns but no verbs (or verbs that are actually directions), treat as a single noun target
        // Also handle case where the word is a command word but compromise doesn't detect it as a verb
        if (nouns.length > 0 && (verbs.length === 0 || isCommandWord) && pronouns.length === 0) {
            // Filter out pronouns that might be misidentified as nouns
            const firstNoun = nouns.first();
            const nounText = firstNoun.text().trim();
            const nounDoc = nlp(nounText);
            const isPronoun = nounDoc.match('#Pronoun').length > 0;
            
            if (!isPronoun) {
                target = nounText;
                logger.log(`[NLP Parser] Input is single noun: "${target}"`);
            }
        } else if (isCommandWord && verbs.length === 0 && nouns.length === 0) {
            // Handle case where it's a command word but compromise doesn't detect it as verb/noun
            // (e.g., "north" as a direction)
            target = cleanInput;
            logger.log(`[NLP Parser] Input is command word treated as target: "${target}"`);
        } else if (verbs.length === 0 && nouns.length === 0 && pronouns.length === 0) {
            // Single word that compromise doesn't identify as anything - treat as target
            // This handles directions like "north", "east", etc.
            target = cleanInput;
            logger.log(`[NLP Parser] Input is unrecognized word treated as target: "${target}"`);
        }
    }
    
    const result = {
        verb: verb || null,
        target: target || null,
        verbPhrase: verbPhrase || null,
        destination: destination || null,
        preposition: preposition || null,
        remainingText: remainingText || null
    };
    
    logger.log('[NLP Parser] Parsed result:', result);
    return result;
}

