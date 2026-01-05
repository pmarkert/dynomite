import { readdirSync, statSync, existsSync } from "fs";
import { join, dirname, resolve, sep } from "path";
import { search } from "@inquirer/prompts";

/**
 * Get file and directory suggestions based on current input
 */
function getFileSuggestions(
  currentInput: string
): Array<{ name: string; value: string; description?: string }> {
  try {
    // Handle empty input - show current directory
    const inputPath = currentInput || ".";
    const resolvedPath = resolve(inputPath);

    // Determine what directory to list and what to filter by
    let searchDir: string;
    let filterTerm: string;
    let prefix: string;

    if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
      // If it's a directory, list its contents
      searchDir = resolvedPath;
      filterTerm = "";
      // Use relative path prefix to avoid showing absolute paths
      if (!currentInput || currentInput === ".") {
        prefix = "";
      } else {
        prefix = currentInput.endsWith(sep) ? currentInput : currentInput + sep;
      }
    } else {
      // Otherwise, list parent directory and filter
      searchDir = dirname(resolvedPath);
      const parts = currentInput.split(sep);
      filterTerm = parts[parts.length - 1] || "";
      prefix = parts.slice(0, -1).join(sep);
      if (prefix && !prefix.endsWith(sep)) prefix += sep;
    }

    if (!existsSync(searchDir)) {
      return [{ name: currentInput, value: currentInput }];
    }

    // Read directory
    const entries = readdirSync(searchDir, { withFileTypes: true });

    // Filter and format
    const suggestions = entries
      .filter((entry) => {
        // Show hidden files only if filter starts with dot
        if (!filterTerm.startsWith(".") && entry.name.startsWith(".")) {
          return false;
        }
        // Substring match (case-insensitive)
        return entry.name.toLowerCase().includes(filterTerm.toLowerCase());
      })
      .map((entry) => {
        const fullPath = prefix + entry.name;
        const displayPath = entry.isDirectory() ? fullPath + sep : fullPath;
        const description = entry.isDirectory() ? "directory" : "file";

        return {
          name: displayPath,
          value: displayPath,
          description,
        };
      })
      .sort((a, b) => {
        // Directories first, then files
        const aIsDir = a.description === "directory";
        const bIsDir = b.description === "directory";
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.name.localeCompare(b.name);
      });

    // Always include the current input as an option (for new files)
    if (currentInput && !suggestions.some((s) => s.value === currentInput)) {
      suggestions.unshift({
        name: currentInput,
        value: currentInput,
        description: "new file",
      });
    }

    return suggestions.length > 0
      ? suggestions
      : [{ name: currentInput || ".", value: currentInput || "." }];
  } catch (error) {
    return [{ name: currentInput || ".", value: currentInput || "." }];
  }
}

/**
 * Prompt for file path with autocomplete
 */
export async function fileSearch(options: {
  message: string;
  validate?: (path: string) => boolean | string;
}): Promise<string> {
  const result = await search({
    message: options.message,
    source: async (input) => {
      return getFileSuggestions(input || "");
    },
  });

  // Validate if provided
  if (options.validate) {
    const validation = options.validate(result);
    if (validation !== true) {
      throw new Error(
        typeof validation === "string" ? validation : "Invalid file path"
      );
    }
  }

  return result;
}
