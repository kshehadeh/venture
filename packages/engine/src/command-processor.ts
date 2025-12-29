import type { SceneContext } from './engine';
import { NormalizedCommandInput } from './command';
import { logger } from './logger';

/**
 * Interface for command processor plugins.
 * Processors take raw user input and extract normalized command input.
 */
export interface ProcessorPlugin {
    /**
     * Process user input and return normalized command input, or null if unable to process.
     * @param input Raw user input string
     * @param context Scene context with objects, exits, NPCs, etc.
     */
    process(input: string, context: SceneContext): Promise<NormalizedCommandInput | null>;
    
    /**
     * Priority determines execution order. Lower numbers = higher priority.
     * Procedural processor should have priority 1, AI processor priority 2.
     */
    priority: number;
}

/**
 * Main command processor that manages processor plugins and executes them in priority order.
 */
export class CommandProcessor {
    private processors: ProcessorPlugin[] = [];

    /**
     * Register a processor plugin.
     */
    registerProcessor(processor: ProcessorPlugin): void {
        this.processors.push(processor);
        // Sort by priority (lower = higher priority)
        this.processors.sort((a, b) => a.priority - b.priority);
    }

    /**
     * Process user input through all registered processors in priority order.
     * Returns the first successful result, or null if all processors fail.
     */
    async process(input: string, context: SceneContext): Promise<NormalizedCommandInput | null> {
        const cleanInput = input.trim();
        logger.log('[CommandProcessor] Processing input:', cleanInput);
        
        if (!cleanInput) {
            logger.log('[CommandProcessor] Empty input, returning null');
            return null;
        }

        // Try each processor in priority order
        logger.log(`[CommandProcessor] Trying ${this.processors.length} processors in priority order`);
        for (let i = 0; i < this.processors.length; i++) {
            const processor = this.processors[i];
            const processorName = processor.constructor.name;
            logger.log(`[CommandProcessor] Trying processor ${i + 1}/${this.processors.length}: ${processorName} (priority: ${processor.priority})`);
            
            const result = await processor.process(cleanInput, context);
            if (result !== null) {
                logger.log(`[CommandProcessor] Processor ${processorName} succeeded:`, JSON.stringify(result, null, 2));
                return result;
            } else {
                logger.log(`[CommandProcessor] Processor ${processorName} returned null, trying next processor`);
            }
        }

        logger.log('[CommandProcessor] All processors failed, returning null');
        return null;
    }
}

