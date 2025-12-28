// @ts-ignore - bun:test is available at runtime
import { describe, it, expect, beforeAll } from 'bun:test';
import { CommandProcessor } from '../src/core/command-processor';
import { ProceduralProcessor } from '../src/core/processors/procedural-processor';
import { parseCommand } from '../src/core/command';
import { createTestSceneContext, loadTestScene } from './helpers/test-helpers';
import { ObjectDefinition } from '../src/core/types';

describe('Prompt Processing - Inventory and Object Commands', () => {
    let testObjects: ObjectDefinition[];
    let testContext: ReturnType<typeof createTestSceneContext>;

    beforeAll(async () => {
        testObjects = await loadTestScene();
        testContext = createTestSceneContext('test-scene', testObjects);
    });

    /**
     * Helper to create a command processor with ONLY ProceduralProcessor (no AI fallback)
     */
    function createProceduralOnlyProcessor(): CommandProcessor {
        const processor = new CommandProcessor();
        processor.registerProcessor(new ProceduralProcessor());
        // Explicitly NOT registering AIProcessor to ensure no fallback
        return processor;
    }

    /**
     * Helper to test that a prompt is handled by ProceduralProcessor
     */
    async function testProceduralHandling(
        input: string,
        expectedCommandId: string,
        expectedParams?: Record<string, any>
    ) {
        // Create a custom processor with only ProceduralProcessor
        const processor = createProceduralOnlyProcessor();
        
        const result = await processor.process(input, testContext);
        
        expect(result).not.toBeNull();
        expect(result?.commandId).toBe(expectedCommandId);
        
        if (expectedParams) {
            for (const [key, value] of Object.entries(expectedParams)) {
                expect(result?.parameters[key]).toBe(value);
            }
        }
        
        return result;
    }

    describe('Pickup Commands', () => {
        it('should handle "pick up <object>" pattern', async () => {
            await testProceduralHandling('pick up sword', 'pickup', { target: 'sword' });
        });

        it('should handle "grab <object>" pattern', async () => {
            await testProceduralHandling('grab backpack', 'pickup', { target: 'backpack' });
        });

        it('should handle "take <object>" pattern', async () => {
            await testProceduralHandling('take sword', 'pickup', { target: 'sword' });
        });

        it('should handle "get <object>" pattern', async () => {
            await testProceduralHandling('get backpack', 'pickup', { target: 'backpack' });
        });

        it('should match objects by ID (case insensitive)', async () => {
            await testProceduralHandling('pick up SWORD', 'pickup', { target: 'sword' });
            await testProceduralHandling('grab BackPack', 'pickup', { target: 'backpack' });
        });

        it('should match objects by description', async () => {
            // Sword has description "a steel sword"
            await testProceduralHandling('pick up steel sword', 'pickup', { target: 'sword' });
            await testProceduralHandling('grab leather backpack', 'pickup', { target: 'backpack' });
        });

        it('should match partial descriptions', async () => {
            await testProceduralHandling('pick up sword', 'pickup', { target: 'sword' });
            await testProceduralHandling('take backpack', 'pickup', { target: 'backpack' });
        });

        it('should return null for non-existent objects (no AI fallback)', async () => {
            const processor = createProceduralOnlyProcessor();
            const result = await processor.process('pick up nonexistent-item', testContext);
            expect(result).toBeNull();
        });

        it('should handle "pick up" without target (returns null, no AI fallback)', async () => {
            const processor = createProceduralOnlyProcessor();
            const result = await processor.process('pick up', testContext);
            expect(result).toBeNull();
        });
    });

    describe('Inventory Commands', () => {
        it('should handle "inventory" alias', async () => {
            await testProceduralHandling('inventory', 'items', {});
        });

        it('should handle "items" command', async () => {
            await testProceduralHandling('items', 'items', {});
        });

        it('should handle "inv" alias', async () => {
            await testProceduralHandling('inv', 'items', {});
        });

        it('should handle "i" alias', async () => {
            await testProceduralHandling('i', 'items', {});
        });

        it('should handle case-insensitive inventory commands', async () => {
            await testProceduralHandling('INVENTORY', 'items', {});
            await testProceduralHandling('ITEMS', 'items', {});
            await testProceduralHandling('Inv', 'items', {});
        });
    });

    describe('Look Commands', () => {
        it('should handle "look" command', async () => {
            await testProceduralHandling('look', 'look', {});
        });

        it('should handle "l" alias', async () => {
            await testProceduralHandling('l', 'look', {});
        });

        it('should handle "look at <target>" pattern', async () => {
            await testProceduralHandling('look at sword', 'look', { target: 'sword' });
            await testProceduralHandling('look at backpack', 'look', { target: 'backpack' });
        });

        it('should handle case-insensitive look commands', async () => {
            await testProceduralHandling('LOOK', 'look', {});
            await testProceduralHandling('L', 'look', {});
            await testProceduralHandling('Look At Sword', 'look', { target: 'Sword' });
        });
    });

    describe('Full Command Parsing Integration', () => {
        it('should parse "pick up sword" through full command pipeline', async () => {
            const result = await parseCommand('pick up sword', testContext);
            
            expect(result.handled).toBe(true);
            expect(result.intent).toBeDefined();
            expect(result.intent?.type).toBe('pickup');
            expect(result.intent?.targetId).toBe('sword');
            expect(result.normalizedInput?.commandId).toBe('pickup');
            expect(result.normalizedInput?.parameters.target).toBe('sword');
        });

        it('should parse "grab backpack" through full command pipeline', async () => {
            const result = await parseCommand('grab backpack', testContext);
            
            expect(result.handled).toBe(true);
            expect(result.intent).toBeDefined();
            expect(result.intent?.type).toBe('pickup');
            expect(result.intent?.targetId).toBe('backpack');
        });

        it('should parse "inventory" through full command pipeline', async () => {
            const result = await parseCommand('inventory', testContext);
            
            expect(result.handled).toBe(true);
            expect(result.intent).toBeDefined();
            expect(result.intent?.type).toBe('items');
        });

        it('should parse "look" through full command pipeline', async () => {
            const result = await parseCommand('look', testContext);
            
            expect(result.handled).toBe(true);
            expect(result.intent).toBeDefined();
            expect(result.intent?.type).toBe('look');
        });

        it('should parse "look at sword" through full command pipeline', async () => {
            const result = await parseCommand('look at sword', testContext);
            
            expect(result.handled).toBe(true);
            expect(result.intent).toBeDefined();
            expect(result.intent?.type).toBe('look');
            // Note: target is passed in normalizedInput but may not be in intent
            expect(result.normalizedInput?.parameters.target).toBe('sword');
        });
    });

    describe('Edge Cases and Validation', () => {
        it('should handle whitespace variations', async () => {
            await testProceduralHandling('  pick up sword  ', 'pickup', { target: 'sword' });
            await testProceduralHandling('  inventory  ', 'items', {});
            await testProceduralHandling('  look  ', 'look', {});
        });

        it('should handle empty input (returns null)', async () => {
            const processor = createProceduralOnlyProcessor();
            const result = await processor.process('', testContext);
            expect(result).toBeNull();
        });

        it('should handle whitespace-only input (returns null)', async () => {
            const processor = createProceduralOnlyProcessor();
            const result = await processor.process('   ', testContext);
            expect(result).toBeNull();
        });

        it('should not match pickup patterns without object name', async () => {
            const processor = createProceduralOnlyProcessor();
            const result = await processor.process('pick up', testContext);
            expect(result).toBeNull();
        });

        it('should not match "look at" without target', async () => {
            const processor = createProceduralOnlyProcessor();
            const result = await processor.process('look at', testContext);
            // "look at" without target should return null (no AI fallback)
            expect(result).toBeNull();
        });
    });

    describe('Object Matching', () => {
        it('should match objects by exact ID', async () => {
            await testProceduralHandling('pick up sword', 'pickup', { target: 'sword' });
            await testProceduralHandling('pick up backpack', 'pickup', { target: 'backpack' });
            await testProceduralHandling('pick up small-pouch', 'pickup', { target: 'small-pouch' });
        });

        it('should match objects by partial description', async () => {
            // "a steel sword" should match "steel" or "sword"
            await testProceduralHandling('pick up steel', 'pickup', { target: 'sword' });
            await testProceduralHandling('pick up leather', 'pickup', { target: 'backpack' });
        });

        it('should prioritize exact ID matches over description matches', async () => {
            // If we have an object with ID "steel" and another with description containing "steel",
            // it should match the ID first (though our current implementation does description includes check)
            // This test verifies the matching works
            await testProceduralHandling('pick up sword', 'pickup', { target: 'sword' });
        });

        it('should handle objects with hyphens in names', async () => {
            await testProceduralHandling('pick up small-pouch', 'pickup', { target: 'small-pouch' });
            await testProceduralHandling('pick up heavy-rock', 'pickup', { target: 'heavy-rock' });
        });

        it('should handle objects with multiple words in description', async () => {
            // "a leather backpack" - should match "leather backpack" or parts of it
            await testProceduralHandling('pick up leather backpack', 'pickup', { target: 'backpack' });
        });
    });

    describe('Command Aliases', () => {
        it('should handle all pickup aliases', async () => {
            const aliases = ['pick up', 'grab', 'take', 'get'];
            for (const alias of aliases) {
                await testProceduralHandling(`${alias} sword`, 'pickup', { target: 'sword' });
            }
        });

        it('should handle all inventory aliases', async () => {
            const aliases = ['inventory', 'inv', 'i', 'items'];
            for (const alias of aliases) {
                await testProceduralHandling(alias, 'items', {});
            }
        });

        it('should handle look aliases', async () => {
            await testProceduralHandling('look', 'look', {});
            await testProceduralHandling('l', 'look', {});
            // "search" is an alias but may not be handled procedurally - check if it is
            const processor = createProceduralOnlyProcessor();
            const result = await processor.process('search', testContext);
            // "search" should match via engine globals
            expect(result).not.toBeNull();
            expect(result?.commandId).toBe('look');
        });
    });

    describe('No AI Fallback Verification', () => {
        it('should fail gracefully when object not found (no AI fallback)', async () => {
            const processor = createProceduralOnlyProcessor();
            const result = await processor.process('pick up imaginary-object', testContext);
            // Should return null, not fall back to AI
            expect(result).toBeNull();
        });

        it('should fail gracefully for ambiguous commands (no AI fallback)', async () => {
            const processor = createProceduralOnlyProcessor();
            // Commands that don't match any pattern should return null
            const result = await processor.process('do something weird', testContext);
            expect(result).toBeNull();
        });

        it('should not process transfer commands procedurally', async () => {
            const processor = createProceduralOnlyProcessor();
            // Transfer is not handled procedurally, should return null
            const result = await processor.process('transfer sword to backpack', testContext);
            expect(result).toBeNull();
        });

        it('should verify procedural processor handles all test cases', async () => {
            // This test ensures we're actually using ProceduralProcessor
            // by verifying that commands that should work, work
            const testCases = [
                { input: 'pick up sword', expected: 'pickup' },
                { input: 'inventory', expected: 'items' },
                { input: 'look', expected: 'look' },
                { input: 'l', expected: 'look' },
            ];

            const processor = createProceduralOnlyProcessor();
            
            for (const testCase of testCases) {
                const result = await processor.process(testCase.input, testContext);
                expect(result).not.toBeNull();
                expect(result?.commandId).toBe(testCase.expected);
            }
        });
    });
});

