import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { search, confirm } from "@inquirer/prompts";
import { dynamoClient, getTableNames } from "../util.js";
import { readFileSync, existsSync } from "fs";
import { Command } from "commander";
import { fileSearch } from "../file-search.js";
import { wrapCommandHandler } from "../command-wrapper.js";

interface Options {
  table?: string;
  input?: string;
}

export function setup(program: Command) {
  program
    .command("import")
    .description("Import a JSON file to a DynamoDB table")
    .option("-t, --table [tableName]", "Destination table name")
    .option(
      "-i, --input [file]",
      "Input file path (reads from stdin if not provided)"
    )
    .action(wrapCommandHandler(importCommand));
}

async function importCommand(options: Options = {}) {
  let toTable = options.table || process.env.TO_TABLE;

  if (!toTable) {
    const tables = await getTableNames();
    toTable = await search({
      message: "Select the destination table:",
      source: async (searchTerm) => {
        if (!searchTerm) return tables.map((t) => ({ value: t }));
        return tables
          .filter((t) => t.toLowerCase().includes(searchTerm.toLowerCase()))
          .map((t) => ({ value: t }));
      },
    });
  }

  if (!toTable) {
    throw new Error("Destination table name is required");
  }

  let stdinData = "";

  // Read from file if provided, otherwise from stdin
  if (options.input) {
    stdinData = readFileSync(options.input, "utf8");
  } else {
    // Prompt user to choose file or use stdin
    const useFile = await confirm({
      message: "Import from file? (No = read from stdin)",
      default: true,
    });

    if (useFile) {
      const inputFile = await fileSearch({
        message: "Select input file:",
        validate: (path: string) => {
          if (!existsSync(path)) {
            return "File does not exist";
          }
          return true;
        },
      });
      stdinData = readFileSync(inputFile, "utf8");
    } else {
      // Read JSON from stdin
      process.stdin.setEncoding("utf8");

      for await (const chunk of process.stdin) {
        stdinData += chunk;
      }
    }
  }

  // Parse the JSON array
  const items: Record<string, any>[] = JSON.parse(stdinData);

  console.error(
    `Read ${items.length} items from ${options.input ? options.input : "stdin"}`
  );

  // Batch write to DynamoDB (max 25 items per batch)
  const BATCH_SIZE = 25;
  let totalWritten = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const putRequests = batch.map((item) => ({
      PutRequest: {
        Item: item,
      },
    }));

    await dynamoClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [toTable]: putRequests,
        },
      })
    );

    totalWritten += batch.length;
    console.error(`Written ${totalWritten}/${items.length} items...`);
  }

  console.error(`\nImported ${totalWritten} items into ${toTable}`);
}
