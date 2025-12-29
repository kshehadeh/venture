// @ts-ignore - bun:test is available at runtime
import { describe, it, expect } from 'bun:test';
import { parseCommand } from '@/utils/nlp-parser';

describe('NLP Parser - parseCommand', () => {
    describe('Commands with no nouns (no target required)', () => {
        it('should parse "look" command', () => {
            const result = parseCommand('look');
            expect(result.verb).toBe('look');
            expect(result.target).toBeNull();
            expect(result.verbPhrase).toBeNull();
            expect(result.destination).toBeNull();
            expect(result.preposition).toBeNull();
            expect(result.remainingText).toBeNull();
        });

        it('should parse "inventory" command', () => {
            const result = parseCommand('inventory');
            expect(result.verb).toBe('inventory');
            expect(result.target).toBeNull();
            expect(result.destination).toBeNull();
        });

        it('should parse "inv" alias', () => {
            const result = parseCommand('inv');
            expect(result.verb).toBe('inv');
            expect(result.target).toBeNull();
        });

        it('should parse "i" alias', () => {
            const result = parseCommand('i');
            expect(result.verb).toBe('i');
            expect(result.target).toBeNull();
        });

        it('should parse "help" command', () => {
            const result = parseCommand('help');
            expect(result.verb).toBe('help');
            expect(result.target).toBeNull();
        });

        it('should parse "effects" command', () => {
            const result = parseCommand('effects');
            expect(result.verb).toBe('effects');
            expect(result.target).toBeNull();
        });

        it('should parse "status" alias for effects', () => {
            const result = parseCommand('status');
            expect(result.verb).toBe('status');
            expect(result.target).toBeNull();
        });
    });

    describe('Commands with one noun (single target)', () => {
        it('should parse "pickup sword"', () => {
            const result = parseCommand('pickup sword');
            expect(result.verb).toBe('pickup');
            expect(result.target).toBe('sword');
            expect(result.verbPhrase).toBeNull();
            expect(result.destination).toBeNull();
            expect(result.preposition).toBeNull();
            expect(result.remainingText).toBeNull();
        });

        it('should parse "pick up sword" (phrasal verb)', () => {
            const result = parseCommand('pick up sword');
            expect(result.verb).toBe('pick up');
            expect(result.verbPhrase).toBe('pick up');
            expect(result.target).toBe('sword');
            expect(result.destination).toBeNull();
            expect(result.remainingText).toBeNull();
        });

        it('should parse "grab torch"', () => {
            const result = parseCommand('grab torch');
            expect(result.verb).toBe('grab');
            expect(result.target).toBe('torch');
        });

        it('should parse "take key"', () => {
            const result = parseCommand('take key');
            expect(result.verb).toBe('take');
            expect(result.target).toBe('key');
        });

        it('should parse "look at door"', () => {
            const result = parseCommand('look at door');
            expect(result.verb).toBe('look at');
            expect(result.verbPhrase).toBe('look at');
            expect(result.target).toBe('door');
            expect(result.destination).toBeNull();
        });

        it('should parse "examine sword"', () => {
            const result = parseCommand('examine sword');
            expect(result.verb).toBe('examine');
            expect(result.target).toBe('sword');
        });

        it('should parse "inspect backpack"', () => {
            const result = parseCommand('inspect backpack');
            expect(result.verb).toBe('inspect');
            expect(result.target).toBe('backpack');
        });

        it('should parse "drop sword"', () => {
            const result = parseCommand('drop sword');
            expect(result.verb).toBe('drop');
            expect(result.target).toBe('sword');
        });

        it('should parse "put down torch"', () => {
            const result = parseCommand('put down torch');
            expect(result.verb).toBe('put down');
            expect(result.verbPhrase).toBe('put down');
            expect(result.target).toBe('torch');
        });
    });

    describe('Commands with two nouns (target and destination)', () => {
        it('should parse "transfer sword to left hand"', () => {
            const result = parseCommand('transfer sword to left hand');
            expect(result.verb).toBe('transfer');
            expect(result.target).toBe('sword');
            expect(result.destination).toBe('left hand');
            expect(result.preposition).toBe('to');
            expect(result.remainingText).toBeNull();
        });

        it('should parse "move key to backpack"', () => {
            const result = parseCommand('move key to backpack');
            expect(result.verb).toBe('move');
            expect(result.target).toBe('key');
            expect(result.destination).toBe('backpack');
            expect(result.preposition).toBe('to');
        });

        it('should parse "put torch in bag"', () => {
            const result = parseCommand('put torch in bag');
            expect(result.verb).toBe('put');
            expect(result.target).toBe('torch');
            expect(result.destination).toBe('bag');
            expect(result.preposition).toBe('in');
        });

        it('should parse "switch sword to right-hand"', () => {
            const result = parseCommand('switch sword to right-hand');
            expect(result.verb).toBe('switch');
            expect(result.target).toBe('sword');
            expect(result.destination).toBe('right-hand');
            expect(result.preposition).toBe('to');
        });

        it('should parse "transfer ring into backpack"', () => {
            const result = parseCommand('transfer ring into backpack');
            expect(result.verb).toBe('transfer');
            expect(result.target).toBe('ring');
            expect(result.destination).toBe('backpack');
            expect(result.preposition).toBe('into');
        });

        it('should parse "move key inside pouch"', () => {
            const result = parseCommand('move key inside pouch');
            expect(result.verb).toBe('move');
            expect(result.target).toBe('key');
            expect(result.destination).toBe('pouch');
            expect(result.preposition).toBe('inside');
        });
    });

    describe('Commands with articles (the, a, an)', () => {
        it('should parse "pickup the sword" and remove article', () => {
            const result = parseCommand('pickup the sword');
            expect(result.verb).toBe('pickup');
            expect(result.target).toBe('sword');
        });

        it('should parse "pick up a torch" and remove article', () => {
            const result = parseCommand('pick up a torch');
            expect(result.verb).toBe('pick up');
            expect(result.target).toBe('torch');
        });

        it('should parse "look at an apple" and remove article', () => {
            const result = parseCommand('look at an apple');
            expect(result.verb).toBe('look at');
            expect(result.target).toBe('apple');
        });

        it('should parse "transfer the sword to the left hand" and remove articles', () => {
            const result = parseCommand('transfer the sword to the left hand');
            expect(result.verb).toBe('transfer');
            expect(result.target).toBe('sword');
            expect(result.destination).toBe('left hand');
            expect(result.preposition).toBe('to');
        });

        it('should parse "move a key into a backpack" and remove articles', () => {
            const result = parseCommand('move a key into a backpack');
            expect(result.verb).toBe('move');
            expect(result.target).toBe('key');
            expect(result.destination).toBe('backpack');
            expect(result.preposition).toBe('into');
        });
    });

    describe('Commands with adjectives and extra words', () => {
        it('should parse "pickup the shiny sword" and extract just "sword"', () => {
            const result = parseCommand('pickup the shiny sword');
            expect(result.verb).toBe('pickup');
            expect(result.target).toBe('sword');
        });

        it('should parse "grab the old rusty key" and extract just "key"', () => {
            const result = parseCommand('grab the old rusty key');
            expect(result.verb).toBe('grab');
            expect(result.target).toBe('key');
        });

        it('should parse "look at the beautiful golden door" and extract just "door"', () => {
            const result = parseCommand('look at the beautiful golden door');
            expect(result.verb).toBe('look at');
            expect(result.target).toBe('door');
        });

        it('should parse "transfer the magical sword to my left hand" and extract nouns correctly', () => {
            const result = parseCommand('transfer the magical sword to my left hand');
            expect(result.verb).toBe('transfer');
            expect(result.target).toBe('sword');
            expect(result.destination).toBe('left hand');
            expect(result.preposition).toBe('to');
        });

        it('should parse "move the small key into the large backpack" and extract nouns correctly', () => {
            const result = parseCommand('move the small key into the large backpack');
            expect(result.verb).toBe('move');
            expect(result.target).toBe('key');
            expect(result.destination).toBe('backpack');
            expect(result.preposition).toBe('into');
        });

        it('should parse "pick up the heavy iron sword from the ground" and extract target', () => {
            const result = parseCommand('pick up the heavy iron sword from the ground');
            expect(result.verb).toBe('pick up');
            expect(result.target).toBe('sword');
            // Note: "from the ground" might not be parsed as destination since "from" is not in our destination prepositions
        });
    });

    describe('Longer sentences with unnecessary information', () => {
        it('should parse "I want to pickup the sword please" and extract verb and target', () => {
            const result = parseCommand('I want to pickup the sword please');
            expect(result.verb).toBe('pickup');
            expect(result.target).toBe('sword');
        });

        it('should parse "can you please transfer the sword to my left hand" and extract all parts', () => {
            const result = parseCommand('can you please transfer the sword to my left hand');
            expect(result.verb).toBe('transfer');
            expect(result.target).toBe('sword');
            expect(result.destination).toBe('left hand');
            expect(result.preposition).toBe('to');
        });

        it('should parse "I would like to look at the door" and extract verb and target', () => {
            const result = parseCommand('I would like to look at the door');
            expect(result.verb).toBe('look at');
            expect(result.target).toBe('door');
        });

        it('should parse "please help me move this key to the backpack" and extract all parts', () => {
            const result = parseCommand('please help me move this key to the backpack');
            expect(result.verb).toBe('move');
            expect(result.target).toBe('key');
            expect(result.destination).toBe('backpack');
            expect(result.preposition).toBe('to');
        });
    });

    describe('Phrasal verbs', () => {
        it('should parse "pick up" as phrasal verb', () => {
            const result = parseCommand('pick up sword');
            expect(result.verb).toBe('pick up');
            expect(result.verbPhrase).toBe('pick up');
            expect(result.target).toBe('sword');
        });

        it('should parse "look at" as phrasal verb', () => {
            const result = parseCommand('look at door');
            expect(result.verb).toBe('look at');
            expect(result.verbPhrase).toBe('look at');
            expect(result.target).toBe('door');
        });

        it('should parse "go to" as phrasal verb for move command', () => {
            const result = parseCommand('go to north');
            expect(result.verb).toBe('go to');
            expect(result.verbPhrase).toBe('go to');
            expect(result.target).toBe('north');
        });

        it('should parse "switch to" as phrasal verb', () => {
            const result = parseCommand('switch to sword');
            expect(result.verb).toBe('switch to');
            expect(result.verbPhrase).toBe('switch to');
            expect(result.target).toBe('sword');
        });

        it('should parse "transfer to" as phrasal verb with destination', () => {
            const result = parseCommand('transfer to left hand');
            expect(result.verb).toBe('transfer to');
            expect(result.verbPhrase).toBe('transfer to');
            // Note: This might not have a target since "transfer to" is the verb phrase
        });
    });

    describe('Case sensitivity', () => {
        it('should handle uppercase input "PICKUP SWORD"', () => {
            const result = parseCommand('PICKUP SWORD');
            expect(result.verb).toBe('PICKUP');
            expect(result.target).toBe('SWORD');
        });

        it('should handle mixed case "PickUp SwOrD"', () => {
            const result = parseCommand('PickUp SwOrD');
            expect(result.verb).toBe('PickUp');
            expect(result.target).toBe('SwOrD');
        });

        it('should handle "Transfer Sword To Left Hand" with mixed case', () => {
            const result = parseCommand('Transfer Sword To Left Hand');
            expect(result.verb).toBe('Transfer');
            expect(result.target).toBe('Sword');
            expect(result.destination).toBe('Left Hand');
            expect(result.preposition).toBe('To');
        });
    });

    describe('Edge cases', () => {
        it('should handle empty string', () => {
            const result = parseCommand('');
            expect(result.verb).toBeNull();
            expect(result.target).toBeNull();
            expect(result.verbPhrase).toBeNull();
            expect(result.destination).toBeNull();
            expect(result.preposition).toBeNull();
            expect(result.remainingText).toBeNull();
        });

        it('should handle whitespace-only input', () => {
            const result = parseCommand('   ');
            expect(result.verb).toBeNull();
            expect(result.target).toBeNull();
        });

        it('should handle single noun without verb (direction)', () => {
            const result = parseCommand('north');
            // This might be treated as a target if no verb is found
            expect(result.target).toBe('north');
        });

        it('should handle "help look" (help with specific command)', () => {
            const result = parseCommand('help look');
            expect(result.verb).toBe('help');
            expect(result.target).toBe('look');
        });

        it('should handle "look at" without target', () => {
            const result = parseCommand('look at');
            expect(result.verb).toBe('look at');
            expect(result.verbPhrase).toBe('look at');
            // Target might be null or empty
        });

        it('should handle multi-word nouns like "left hand"', () => {
            const result = parseCommand('transfer sword to left hand');
            expect(result.target).toBe('sword');
            expect(result.destination).toBe('left hand');
        });

        it('should handle multi-word nouns like "backpack sheath slot"', () => {
            const result = parseCommand('transfer sword to backpack sheath slot');
            expect(result.target).toBe('sword');
            expect(result.destination).toBe('backpack sheath slot');
        });
    });

    describe('Complex sentences with multiple prepositions', () => {
        it('should parse "transfer sword from backpack to left hand" correctly', () => {
            const result = parseCommand('transfer sword from backpack to left hand');
            expect(result.verb).toBe('transfer');
            expect(result.target).toBe('sword');
            // Should find "to" as the destination preposition, not "from"
            expect(result.preposition).toBe('to');
            expect(result.destination).toBe('left hand');
        });

        it('should parse "move key out of bag into pocket" correctly', () => {
            const result = parseCommand('move key out of bag into pocket');
            expect(result.verb).toBe('move');
            expect(result.target).toBe('key');
            // Should find "into" as the destination preposition
            expect(result.preposition).toBe('into');
            expect(result.destination).toBe('pocket');
        });
    });

    describe('Command aliases', () => {
        it('should parse "grab" as pickup alias', () => {
            const result = parseCommand('grab sword');
            expect(result.verb).toBe('grab');
            expect(result.target).toBe('sword');
        });

        it('should parse "take" as pickup alias', () => {
            const result = parseCommand('take torch');
            expect(result.verb).toBe('take');
            expect(result.target).toBe('torch');
        });

        it('should parse "get" as pickup alias', () => {
            const result = parseCommand('get key');
            expect(result.verb).toBe('get');
            expect(result.target).toBe('key');
        });

        it('should parse "examine" as look alias', () => {
            const result = parseCommand('examine door');
            expect(result.verb).toBe('examine');
            expect(result.target).toBe('door');
        });

        it('should parse "inspect" as look alias', () => {
            const result = parseCommand('inspect sword');
            expect(result.verb).toBe('inspect');
            expect(result.target).toBe('sword');
        });

        it('should parse "go" as move alias', () => {
            const result = parseCommand('go north');
            expect(result.verb).toBe('go');
            expect(result.target).toBe('north');
        });

        it('should parse "walk" as move alias', () => {
            const result = parseCommand('walk east');
            expect(result.verb).toBe('walk');
            expect(result.target).toBe('east');
        });
    });

    describe('Real-world complex examples', () => {
        it('should parse "I need to pick up that shiny golden sword over there"', () => {
            const result = parseCommand('I need to pick up that shiny golden sword over there');
            expect(result.verb).toBe('pick up');
            expect(result.target).toBe('sword');
        });

        it('should parse "can you help me transfer my favorite sword to my left hand please"', () => {
            const result = parseCommand('can you help me transfer my favorite sword to my left hand please');
            expect(result.verb).toBe('transfer');
            expect(result.target).toBe('sword');
            expect(result.destination).toBe('left hand');
            expect(result.preposition).toBe('to');
        });

        it('should parse "please look at the mysterious door in the corner"', () => {
            const result = parseCommand('please look at the mysterious door in the corner');
            expect(result.verb).toBe('look at');
            expect(result.target).toBe('door');
            // "in the corner" might be parsed as destination, but "door" should be the target
        });

        it('should parse "I want to move the small key from my pocket into the large backpack"', () => {
            const result = parseCommand('I want to move the small key from my pocket into the large backpack');
            expect(result.verb).toBe('move');
            expect(result.target).toBe('key');
            expect(result.destination).toBe('backpack');
            expect(result.preposition).toBe('into');
        });
    });
});

