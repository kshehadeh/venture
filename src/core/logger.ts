import { writeFile, appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Logger that writes to a file instead of console to avoid interfering with TUI rendering.
 */
class Logger {
    private logFile: string;
    private initialized: boolean = false;

    constructor() {
        // Create logs directory in project root
        const logsDir = join(process.cwd(), 'logs');
        this.logFile = join(logsDir, 'venture.log');
    }

    /**
     * Initialize the logger by creating the logs directory if it doesn't exist.
     */
    private async ensureInitialized(): Promise<void> {
        if (this.initialized) return;

        const logsDir = join(process.cwd(), 'logs');
        if (!existsSync(logsDir)) {
            await mkdir(logsDir, { recursive: true });
        }

        // Write initial log entry
        const timestamp = new Date().toISOString();
        await writeFile(this.logFile, `[${timestamp}] Logger initialized\n`, { flag: 'w' });
        this.initialized = true;
    }

    /**
     * Write a log entry to the file.
     * Fire-and-forget - doesn't block execution.
     */
    private write(level: string, message: string, ...args: any[]): void {
        // Fire and forget - don't await, just start the async operation
        this.ensureInitialized().then(() => {
            const timestamp = new Date().toISOString();
            const formattedArgs = args.length > 0 
                ? ' ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ')
                : '';
            const logLine = `[${timestamp}] [${level}] ${message}${formattedArgs}\n`;
            
            appendFile(this.logFile, logLine, 'utf8').catch((error) => {
                // Fallback to console if file write fails
                console.error('Failed to write to log file:', error);
                console.log(logLine.trim());
            });
        }).catch((error) => {
            // If initialization fails, fallback to console
            const timestamp = new Date().toISOString();
            const formattedArgs = args.length > 0 
                ? ' ' + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ')
                : '';
            const logLine = `[${timestamp}] [${level}] ${message}${formattedArgs}`;
            console.log(logLine);
        });
    }

    /**
     * Log an info message.
     * Fire-and-forget - doesn't block execution.
     */
    log(message: string, ...args: any[]): void {
        this.write('INFO', message, ...args);
    }

    /**
     * Log an error message.
     * Fire-and-forget - doesn't block execution.
     */
    error(message: string, ...args: any[]): void {
        this.write('ERROR', message, ...args);
    }

    /**
     * Log a warning message.
     * Fire-and-forget - doesn't block execution.
     */
    warn(message: string, ...args: any[]): void {
        this.write('WARN', message, ...args);
    }

    /**
     * Log a debug message.
     * Fire-and-forget - doesn't block execution.
     */
    debug(message: string, ...args: any[]): void {
        this.write('DEBUG', message, ...args);
    }

    /**
     * Get the path to the current log file.
     */
    getLogFile(): string {
        return this.logFile;
    }
}

// Export singleton instance
export const logger = new Logger();

