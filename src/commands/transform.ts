import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import { fileSearch } from "../file-search.js";
import { search, confirm } from "@inquirer/prompts";
import { Command } from "commander";
import { wrapCommandHandler } from "../command-wrapper.js";

interface Options {
  input?: string;
  transform?: string;
  output?: string;
}

export function setup(program: Command) {
  program
    .command("transform")
    .description(
      "Apply a user-provided JavaScript or TypeScript transform to every item in a JSON file."
    )
    .addHelpText(
      "after",
      [
        "\nTransform module must export a function (default or named 'transform'):",
        "  // Example (ESM):",
        "  export default (item) => {",
        "    item.migratedAt = new Date().toISOString();",
        "    return item;",
        "  };",
        "\nTypeScript files are supported at runtime if you install 'esbuild' and 'esbuild-register':",
        "  npm install --save-dev esbuild esbuild-register",
        "\nExamples:",
        "  # Interactive prompts for files",
        "  dynomite transform",
        "\n  # Specify files directly",
        "  dynomite transform --input exported.json --transform ./migrations/add-field.js --output migrated.json",
        "\n  # Pipe via stdin/stdout",
        "  cat exported.json | dynomite transform --transform ./migrations/add-field.js > migrated.json",
        "",
      ].join("\n")
    )
    .option(
      "-i, --input [file]",
      "Input JSON file (reads from stdin if not provided)"
    )
    .option(
      "-t, --transform [file]",
      "Path to user transform module (exports a default or named function)"
    )
    .option("-o, --output [file]", "Output file path")
    .action(wrapCommandHandler(transformCommand));
}

async function transformCommand(options: Options = {}) {
  let inputFile = options.input;
  let transformFile = options.transform;
  let outputFile = options.output;

  // Ask for input file if not provided
  if (!inputFile) {
    const useFile = await confirm({
      message: "Read input from file? (No = stdin)",
      default: true,
    });

    if (useFile) {
      inputFile = await fileSearch({ message: "Select input JSON file:" });
      if (!existsSync(inputFile)) throw new Error("Input file does not exist");
    } else {
      // read from stdin
      let stdin = "";
      process.stdin.setEncoding("utf8");
      for await (const chunk of process.stdin) stdin += chunk;
      await runTransform(stdin, transformFile, outputFile);
      return;
    }
  }

  // Ask for transform file if not provided
  if (!transformFile) {
    transformFile = await fileSearch({
      message: "Select transform module file:",
    });
    if (!existsSync(transformFile))
      throw new Error("Transform file does not exist");
  }

  // Ask for output if not provided
  if (!outputFile) {
    outputFile = await fileSearch({
      message: "Select or enter output file path:",
    });
  }

  const inputData = readFileSync(inputFile!, "utf8");
  await runTransform(inputData, transformFile!, outputFile!);
}

async function runTransform(
  inputData: string,
  transformFile: string | undefined,
  outputFile: string | undefined
) {
  const items: Record<string, any>[] = JSON.parse(inputData);

  if (!transformFile) throw new Error("Transform module is required");

  // Load transform module. Support .ts by using esbuild-register if available.
  let transformFn:
    | ((
        item: Record<string, any>
      ) =>
        | Record<string, any>
        | Record<string, any>[]
        | undefined
        | null
        | Promise<
            Record<string, any> | Record<string, any>[] | undefined | null
          >)
    | null = null;

  // Try to require dynamically. Use dynamic import which works with ES modules.
  // If the user provided a TypeScript file, attempt to load esbuild-register at runtime.
  try {
    if (transformFile.endsWith(".ts")) {
      try {
        // Dynamically import esbuild-register at runtime if available.
        // Use a string import to avoid compile-time type resolution.
        // @ts-ignore
        const registerModule: any = await import("esbuild-register");
        if (registerModule) {
          // esbuild-register may export a register function or default which is a function
          const reg =
            registerModule.register || registerModule.default || registerModule;
          if (typeof reg === "function") {
            reg();
          }
        }
      } catch (e) {
        throw new Error(
          "Loading TypeScript transform requires 'esbuild'/'esbuild-register' to be installed. Install esbuild and try again."
        );
      }
    }

    // Resolve transform file to an absolute path and import via file:// URL
    const { resolve } = await import("path");
    const { pathToFileURL } = await import("url");
    const resolvedPath = resolve(transformFile);
    const fileUrl = pathToFileURL(resolvedPath).href;
    const mod = await import(fileUrl);

    // Prefer default export then named export 'transform' or 'default'
    transformFn = (mod.default || mod.transform || mod.apply) as any;

    if (!transformFn || typeof transformFn !== "function") {
      throw new Error(
        "Transform module must export a function as default or named 'transform'"
      );
    }
  } catch (err) {
    throw new Error(
      `Failed to load transform module: ${
        err && (err as any).message ? (err as any).message : String(err)
      }`
    );
  }

  const results: Record<string, any>[] = [];
  let index = 0;
  for (const item of items) {
    index++;
    try {
      const res = await transformFn(item);

      // If transform returns null/undefined/void -> skip (don't add anything)
      if (res == null) {
        continue;
      }

      // If the transform returns an array, push each item separately
      if (Array.isArray(res)) {
        for (const r of res) {
          results.push(r as Record<string, any>);
        }
        continue;
      }

      // Otherwise push the single transformed item
      results.push(res as Record<string, any>);
    } catch (err) {
      throw new Error(`Transform failed at item #${index}: ${String(err)}`);
    }
  }

  // Write output
  if (!outputFile) {
    // print to stdout
    process.stdout.write(JSON.stringify(results, null, 2));
  } else {
    mkdirSync(dirname(outputFile), { recursive: true });
    writeFileSync(outputFile, JSON.stringify(results, null, 2), "utf8");
    console.error(`Wrote ${results.length} transformed items to ${outputFile}`);
  }
}

export default {};
