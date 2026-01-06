export function formatError(err: unknown): {
  title: string;
  message: string;
  hint?: string;
} {
  const maybeMessage =
    err && typeof err === "object" && "message" in (err as any)
      ? String((err as any).message)
      : String(err ?? "Unknown error");

  const title = maybeMessage.split("\n")[0] || "Error";
  const msgLower = maybeMessage.toLowerCase();

  let hint: string | undefined;

  if (
    msgLower.includes("region is missing") ||
    msgLower.includes("missing region") ||
    msgLower.includes("no region")
  ) {
    hint =
      "AWS region is not configured. Set AWS_REGION, configure ~/.aws/config, or pass a region to your command.";
  } else if (
    msgLower.includes("credentials") ||
    msgLower.includes("access key") ||
    msgLower.includes("no credentials") ||
    msgLower.includes("could not load credentials")
  ) {
    hint =
      "AWS credentials not found. Configure AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, set a profile, or run 'aws configure'.";
  }

  return { title, message: maybeMessage, hint };
}

export function handleErrorAndExit(err: unknown): never {
  const out = formatError(err);

  // Primary short message
  console.error(`Error: ${out.title}`);

  // Provide the concise message underneath (avoid printing large stacks by default)
  if (out.message && out.message !== out.title) {
    console.error(out.message);
  }

  if (out.hint) {
    console.error(`Hint: ${out.hint}`);
  }

  // If developer needs debugging details, allow showing full stack by enabling DEBUG
  const debug = Boolean(process.env.DEBUG);
  if (debug) {
    // Try to show a stack if available
    if (err && typeof err === "object" && "stack" in (err as any)) {
      console.error((err as any).stack);
    } else {
      console.error(String(err));
    }
  } else {
    console.error("Run with DEBUG=1 to see a full stack trace.");
  }

  // Use non-zero exit code to indicate failure
  process.exit(1);
}
