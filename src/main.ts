import { createGameContext } from "./core/context";
import { startApp } from "./ui/app";

async function main() {
  const context = createGameContext();

  await startApp(context);
}

main().catch((error) => {
  console.error("Failed to start the TUI game scaffold:", error);
  process.exit(1);
});
