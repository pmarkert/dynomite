import { search } from "@inquirer/prompts";
import { queryTable, getTableNames, getTableKeySchema } from "../util.js";
import { fileSearch } from "../file-search.js";
import { createWriteStream, mkdirSync } from "fs";
import { dirname } from "path";
import type { Writable } from "stream";
import { Command } from "commander";
import {
  addFilterOptions,
  FilterCommandOptions,
  parseFilterOptions,
} from "../filter-options.js";
import { wrapCommandHandler } from "../command-wrapper.js";

interface Options extends FilterCommandOptions {
  table?: string;
  output?: string;
}

export function setup(program: Command) {
  const command = program
    .command("export")
    .description("Export a DynamoDB table to a JSON file")
    .option("-t, --table [tableName]", "Source table name")
    .option("-o, --output [file]", "Output file path");

  // Add filter options
  addFilterOptions(command);

  command.action(wrapCommandHandler(exportCommand));
}

async function exportCommand(options: Options = {}) {
  let fromTable = options.table || process.env.FROM_TABLE;
  let outputFile = options.output;

  if (!fromTable || !outputFile) {
    const tables = await getTableNames();

    if (!fromTable) {
      fromTable = await search({
        message: "Select the source table:",
        source: async (searchTerm) => {
          if (!searchTerm) return tables.map((t) => ({ value: t }));
          return tables
            .filter((t) => t.toLowerCase().includes(searchTerm.toLowerCase()))
            .map((t) => ({ value: t }));
        },
      });
    }

    if (!outputFile) {
      outputFile = await fileSearch({
        message: "Select or enter output file path:",
      });
    }
  }

  if (!fromTable) {
    throw new Error("Source table name is required");
  }

  // Get table key schema
  const keySchema = await getTableKeySchema(fromTable);

  // Parse query options using shared function
  const queryOptions = parseFilterOptions(options, keySchema);

  // Determine output destination
  const outputStream: Writable = outputFile
    ? (() => {
        // Ensure directory exists before creating file stream
        mkdirSync(dirname(outputFile), { recursive: true });
        return createWriteStream(outputFile);
      })()
    : process.stdout;

  let totalItems = 0;
  let isFirstItem = true;

  // Start the JSON array
  outputStream.write("[\n");

  // Log query type
  if (queryOptions.partitionKey) {
    console.error(
      `Querying with partition key: ${queryOptions.partitionKey.name}=${queryOptions.partitionKey.value}`
    );
    if (queryOptions.indexName) {
      console.error(`Using index: ${queryOptions.indexName}`);
    }
  } else {
    console.error("Performing full table scan");
  }

  for await (const item of queryTable(fromTable, queryOptions)) {
    // Add comma before each item except the first
    if (!isFirstItem) {
      outputStream.write(",\n");
    }

    // Write the item as JSON
    outputStream.write(JSON.stringify(item, null, 2));

    isFirstItem = false;
    totalItems++;
  }

  // Close the JSON array
  outputStream.write("\n]");

  // Close file stream if we created one
  if (outputFile) {
    (outputStream as ReturnType<typeof createWriteStream>).end();
    console.error(
      `\nExported ${totalItems} items from ${fromTable} to ${outputFile}`
    );
  } else {
    console.error(`\nExported ${totalItems} items from ${fromTable}`);
  }
}
