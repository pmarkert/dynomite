/**
 * Wraps a command handler with standardized error handling
 */
export function wrapCommandHandler<T>(
  handler: (options: T) => Promise<void>
): (options: T) => Promise<void> {
  return async (options: T) => {
    try {
      await handler(options);
    } catch (error) {
      if (error instanceof Error && error.name === "ExitPromptError") {
        console.error("\nOperation cancelled.");
        process.exit(0);
      }
      console.error("Error:", error);
      process.exit(1);
    }
  };
}
