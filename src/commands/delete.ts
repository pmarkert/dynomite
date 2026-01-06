import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { Command } from "commander";
import { search, input } from "@inquirer/prompts";
import {
  addFilterOptions,
  FilterCommandOptions,
  parseFilterOptions,
} from "../filter-options.js";
import {
  dynamoClient,
  extractKeys,
  getTableKeySchema,
  queryTable,
  getTableNames,
} from "../util.js";
import { wrapCommandHandler } from "../command-wrapper.js";

interface Options extends FilterCommandOptions {
  table?: string;
}

export function setup(program: Command) {
  const command = program
    .command("delete")
    .description("Delete matching items from a DynamoDB table")
    .option("-t, --table [tableName]", "Table name");

  // Add filter options
  addFilterOptions(command);

  command.action(wrapCommandHandler(deleteCommand));
}

async function deleteCommand(options: Options = {}) {
  let tableName = options.table || process.env.TABLE_NAME;

  if (!tableName) {
    const tables = await getTableNames();
    tableName = await search({
      message: "Select the table:",
      source: async (searchTerm) => {
        if (!searchTerm) return tables.map((t) => ({ value: t }));
        return tables
          .filter((t) => t.toLowerCase().includes(searchTerm.toLowerCase()))
          .map((t) => ({ value: t }));
      },
    });
  }

  if (!tableName) {
    throw new Error("Table name is required");
  }

  // Get table key schema
  const keySchema = await getTableKeySchema(tableName);

  // Parse query options using shared function
  const queryOptions = parseFilterOptions(options, keySchema);

  // Log query type
  console.error("=".repeat(60));
  if (queryOptions.partitionKey) {
    console.error(
      `Query type: Partition key filter (${queryOptions.partitionKey.name}=${queryOptions.partitionKey.value})`
    );
    if (queryOptions.indexName) {
      console.error(`Using index: ${queryOptions.indexName}`);
    }
    if (queryOptions.sortKey) {
      console.error(
        `Sort key filter: ${queryOptions.sortKey.name} ${queryOptions.sortKey.operator} ${queryOptions.sortKey.value}`
      );
    }
  } else {
    console.error("Query type: Full table scan");
  }
  if (queryOptions.filterExpression) {
    console.error(`Filter expression: ${queryOptions.filterExpression}`);
  }
  console.error("=".repeat(60));

  // First, collect all items to get count and keys
  console.error("\nScanning for matching items...");
  const items: Record<string, any>[] = [];
  for await (const item of queryTable(tableName, queryOptions)) {
    items.push(item);
  }

  const itemCount = items.length;
  console.error(`\nFound ${itemCount} matching items.`);

  if (itemCount === 0) {
    console.error("No items to delete.");
    return;
  }

  // Prompt for confirmation
  const action = await input({
    message: `Delete ${itemCount} items? (Y/n/p - p to preview keys):`,
    default: "n",
    validate: (value: string) => {
      const normalized = value.toLowerCase();
      if (["y", "n", "p"].includes(normalized)) {
        return true;
      }
      return "Please enter Y (yes), n (no), or p (preview)";
    },
  });

  const normalizedAction = action.toLowerCase();

  if (normalizedAction === "p") {
    // Preview mode - show the keys
    console.error("\nPreview of keys to be deleted:");
    console.error("-".repeat(60));
    items.slice(0, 100).forEach((item, index) => {
      console.error(
        `${index + 1}. ${JSON.stringify(extractKeys(item, keySchema))}`
      );
    });
    if (items.length > 100) {
      console.error(`... and ${items.length - 100} more items`);
    }
    console.error("-".repeat(60));

    // Ask again after preview
    const confirmDelete = await input({
      message: `Proceed with deletion? (Y/n):`,
      default: "n",
      validate: (value: string) => {
        const normalized = value.toLowerCase();
        if (["y", "n"].includes(normalized)) {
          return true;
        }
        return "Please enter Y (yes) or n (no)";
      },
    });

    if (confirmDelete.toLowerCase() !== "y") {
      console.error("Deletion cancelled.");
      return;
    }
  } else if (normalizedAction !== "y") {
    console.error("Deletion cancelled.");
    return;
  }

  // Perform deletion
  console.error("\nDeleting items...");
  const BATCH_SIZE = 25;
  let totalDeleted = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const deleteRequests = batch.map((item) => ({
      DeleteRequest: {
        Key: extractKeys(item, keySchema),
      },
    }));

    await dynamoClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: deleteRequests,
        },
      })
    );

    totalDeleted += batch.length;
    console.error(`Deleted ${totalDeleted}/${itemCount} items...`);
  }

  console.error(
    `\n✓ Successfully deleted ${totalDeleted} items from ${tableName}`
  );
}
