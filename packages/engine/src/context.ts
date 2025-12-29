import { loadConfig } from "./config";

export interface GameContext {
  /**
   * Placeholder for core game state and configuration.
   * Extend this interface as the game grows.
   */
  config: ReturnType<typeof loadConfig>;
}

export function createGameContext(): GameContext {
  const config = loadConfig();

  return {
    config,
  };
}
