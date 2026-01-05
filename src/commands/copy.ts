import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { search } from "@inquirer/prompts";
import {
  dynamoClient,
  queryTable,
  getTableNames,
  getTableKeySchema,
} from "../util.js";
import { Command } from "commander";
import { addFilterOptions, parseFilterOptions } from "../filter-options.js";
import { wrapCommandHandler } from "../command-wrapper.js";

interface Options {
  from?: string;
  to?: string;
  partitionKey?: string;
  sortKey?: string;
  index?: string;
  filter?: string;
  filterAttrs?: string;
}

export function setup(program: Command) {
  const command = program
    .command("copy")
    .description("Copy all data from one DynamoDB table to another")
    .option("-f, --from [tableName]", "Source table name")
    .option("-t, --to [tableName]", "Destination table name");

  // Add filter options
  addFilterOptions(command);

  command.action(wrapCommandHandler(copyCommand));
}

async function copyCommand(options: Options = {}) {
  let fromTable = options.from || process.env.FROM_TABLE;
  let toTable = options.to || process.env.TO_TABLE;

  if (!fromTable || !toTable) {
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

    if (!toTable) {
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
  }

  if (!fromTable || !toTable) {
    throw new Error("Both source and destination table names are required");
  }

  // Get table key schema for source table
  const keySchema = await getTableKeySchema(fromTable);

  // Parse query options using shared function
  const queryOptions = parseFilterOptions(options, keySchema);

  // Log query type
  if (queryOptions.partitionKey) {
    console.error(
      `Copying with partition key filter: ${queryOptions.partitionKey.name}=${queryOptions.partitionKey.value}`
    );
    if (queryOptions.indexName) {
      console.error(`Using index: ${queryOptions.indexName}`);
    }
  } else {
    console.error("Copying entire table");
  }

  const batch: Record<string, any>[] = [];
  let totalItems = 0;

  let pages = 0;
  for await (const item of queryTable(fromTable, queryOptions)) {
    batch.push(item);

    if (batch.length === 25) {
      await writeBatch(batch, toTable, pages);
      totalItems += batch.length;
      pages++;
      console.log(`Page: ${pages} - ${totalItems} items copied so far.`);
      batch.length = 0;
    }
  }

  // Write any remaining items
  if (batch.length > 0) {
    await writeBatch(batch, toTable, pages);
    totalItems += batch.length;
    pages++;
    console.log(`Page: ${pages} - ${totalItems} items copied in total.`);
  }
}

async function writeBatch(
  items: Record<string, any>[],
  toTable: string,
  pageNum: number
) {
  const requestItems = {
    [toTable]: items.map((item) => ({
      PutRequest: {
        Item: item,
      },
    })),
  };

  await dynamoClient.send(
    new BatchWriteCommand({
      RequestItems: requestItems,
    })
  );
}
