#!/usr/bin/env node

import { NewCommand } from "@gutenye/commander-completion-carapace";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const program = new NewCommand();

program
  .name("dynomite")
  .description("CLI tool for DynamoDB table migration and management")
  .version("1.0.0")
  .enableCompletion();

// Auto-discover and register all commands from the commands folder
const commandsDir = join(__dirname, "commands");
const commandFiles = readdirSync(commandsDir).filter((file) =>
  file.endsWith(".js")
);

for (const file of commandFiles) {
  const commandModule = await import(join(commandsDir, file));
  if (commandModule.setup && typeof commandModule.setup === "function") {
    commandModule.setup(program);
  }
}

// Add completion command
program
  .command("completion")
  .description("Install shell completion for dynomite")
  .action(async () => {
    await program.installCompletion();
    console.log("\nShell completion has been installed!");
    console.log("Restart your shell or run: source ~/.zshrc (or ~/.bashrc)");
  });

program.parse();
