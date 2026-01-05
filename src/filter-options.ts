import { Command } from "commander";
import { QueryOptions, KeySchema } from "./util.js";

/**
 * Adds filter options to a command for querying/scanning DynamoDB tables
 */
export function addFilterOptions(command: Command): Command {
  return command
    .option(
      "--pk, --partition-key [key]",
      "Partition key filter (format: value or =:value)"
    )
    .option(
      "--sk, --sort-key [key]",
      "Sort key filter (format: value, operator:value, begins_with:value, or between:val1:val2)"
    )
    .option("--index [indexName]", "Index name to query (for GSI/LSI)")
    .option(
      "--filter [expression]",
      "Filter expression for additional filtering"
    )
    .option(
      "--filter-attrs [json]",
      'Filter attribute values as JSON (format: \'{"key":"value"}\')'
    );
}

interface FilterCommandOptions {
  partitionKey?: string;
  sortKey?: string;
  index?: string;
  filter?: string;
  filterAttrs?: string;
}

/**
 * Parses command line filter options into QueryOptions
 * Requires keySchema to infer attribute names from table structure
 */
export function parseFilterOptions(
  options: FilterCommandOptions,
  keySchema: KeySchema
): QueryOptions {
  const queryOptions: QueryOptions = {};

  // Parse partition key
  // Supports formats:
  // - "value" (assumes = operator)
  // - "=:value" (explicit = operator)
  if (options.partitionKey) {
    const input = options.partitionKey;

    // Check for operator prefix
    const operatorMatch = input.match(/^(=):(.+)$/);
    if (operatorMatch) {
      queryOptions.partitionKey = {
        name: keySchema.partitionKey,
        value: operatorMatch[2],
      };
    } else {
      // No operator, assume equality
      queryOptions.partitionKey = {
        name: keySchema.partitionKey,
        value: input,
      };
    }
  }

  // Parse sort key
  // Supports formats:
  // - "value" (assumes = operator)
  // - "operator:value" (e.g., ">=:100", "<:50")
  // - "between:value1:value2"
  // - "begins_with:value"
  if (options.sortKey) {
    const input = options.sortKey;

    if (!keySchema.sortKey) {
      throw new Error("Table does not have a sort key");
    }

    const name = keySchema.sortKey;

    if (input.startsWith("between:")) {
      const values = input.substring(8).split(":");
      if (values.length !== 2) {
        throw new Error("Invalid between format. Use: between:value1:value2");
      }
      queryOptions.sortKey = {
        name,
        operator: "between",
        value: values[0],
        value2: values[1],
      };
    } else if (input.startsWith("begins_with:")) {
      queryOptions.sortKey = {
        name,
        operator: "begins_with",
        value: input.substring(12),
      };
    } else {
      // Check for comparison operators
      const operatorMatch = input.match(/^(<=|>=|<|>|=):(.+)$/);
      if (operatorMatch) {
        queryOptions.sortKey = {
          name,
          operator: operatorMatch[1],
          value: operatorMatch[2],
        };
      } else {
        // No operator, assume equality
        queryOptions.sortKey = {
          name,
          operator: "=",
          value: input,
        };
      }
    }
  }

  // Add index name
  if (options.index) {
    queryOptions.indexName = options.index;
  }

  // Add filter expression
  if (options.filter) {
    queryOptions.filterExpression = options.filter;
  }

  // Parse filter attributes JSON
  if (options.filterAttrs) {
    try {
      queryOptions.filterAttributes = JSON.parse(options.filterAttrs);
    } catch (error) {
      throw new Error(
        'Invalid filter attributes JSON. Use format: \'{"key":"value"}\''
      );
    }
  }

  return queryOptions;
}
