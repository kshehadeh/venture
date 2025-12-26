import { GameContext } from "../core/context";

export async function startApp(context: GameContext): Promise<void> {
  // Placeholder for the interactive loop or screen management.
  renderWelcome(context);
}

function renderWelcome(context: GameContext) {
  const banner = [
    "==========================",
    `  ${context.config.title}`,
    "  A terminal-first adventure",
    "==========================",
  ].join("\n");

  console.log(banner);
  console.log("Game loop not yet implemented. Stay tuned!");
}
