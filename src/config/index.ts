export interface GameConfig {
  /**
   * Title displayed in the TUI banner. Update as the game theme solidifies.
   */
  title: string;
  /**
   * Overall difficulty placeholder; wire this into mechanics as they are built.
   */
  difficulty: "easy" | "normal" | "hard";
}

const defaultConfig: GameConfig = {
  title: "Venture (TUI)",
  difficulty: "normal",
};

export function loadConfig(): GameConfig {
  // This can later read from files or environment variables.
  return defaultConfig;
}
