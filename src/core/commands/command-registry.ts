import { z } from 'zod';
import { Command } from './base-command';
import { LookCommand } from './look-command';
import { InventoryCommand } from './inventory-command';
import { PickupCommand } from './pickup-command';
import { MoveCommand } from './move-command';
import { TransferCommand } from './transfer-command';
import { HelpCommand } from './help-command';
import { EffectsCommand } from './effects-command';
import { ActionIntent } from '../types';

/**
 * Registry that maps command IDs to command class instances.
 */
export class CommandRegistry {
    private commands: Map<string, Command> = new Map();

    constructor() {
        // Register built-in engine commands
        this.register(new LookCommand());
        this.register(new InventoryCommand());
        this.register(new PickupCommand());
        this.register(new MoveCommand());
        this.register(new TransferCommand());
        this.register(new HelpCommand());
        this.register(new EffectsCommand());
    }

    /**
     * Register a command instance.
     */
    register(command: Command): void {
        this.commands.set(command.getCommandId(), command);
    }

    /**
     * Get a command by ID.
     */
    getCommand(commandId: string): Command | null {
        return this.commands.get(commandId) || null;
    }

    /**
     * Get the Zod schema for a command's parameters.
     * Returns null if command not found.
     */
    getSchemaForCommand(commandId: string): z.ZodSchema | null {
        const command = this.getCommand(commandId);
        return command ? command.getParameterSchema() : null;
    }

    /**
     * Check if a command ID is registered.
     */
    hasCommand(commandId: string): boolean {
        return this.commands.has(commandId);
    }

    /**
     * Get all registered command IDs.
     */
    getAllCommandIds(): string[] {
        return Array.from(this.commands.keys());
    }

    /**
     * Find a command based on an ActionIntent.
     * Iterates through all registered commands and returns the first one that matches the intent.
     */
    findCommand(intent: ActionIntent): Command | null {
        for (const command of this.commands.values()) {
            if (command.matchesIntent(intent)) {
                return command;
            }
        }
        return null;
    }
}

