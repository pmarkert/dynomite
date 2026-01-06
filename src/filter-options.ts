import { Command } from "commander";
import { QueryOptions, KeySchema } from "./util.js";

/**
 * Adds filter options to a command for querying/scanning DynamoDB tables
 */
export function addFilterOptions(command: Command): Command {
  return command
    .option("--pk [key]", "Partition key filter (format: value or =:value)")
    .option(
      "--sk [key]",
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
  // Parse filter attributes JSON first so normalization can reuse them
  if (options.filterAttrs) {
    try {
      queryOptions.filterAttributes = JSON.parse(options.filterAttrs);
    } catch (error) {
      throw new Error(
        'Invalid filter attributes JSON. Use format: \'{"key":"value"}\''
      );
    }
  }

  // Add filter expression
  if (options.filter) {
    // Normalize simple filter expressions into Dynamo-safe placeholders
    // e.g. type=goal  ->  #type = :type  with filterAttributes { type: 'goal' }
    const existingAttrs = queryOptions.filterAttributes || {};
    const { expression, attributes } = normalizeFilterExpression(
      options.filter,
      existingAttrs
    );
    queryOptions.filterExpression = expression;
    queryOptions.filterAttributes = { ...existingAttrs, ...attributes };
  }

  return queryOptions;
}

/**
 * Convert a user-friendly filter string into an expression using
 * ExpressionAttributeNames (#+name) and ExpressionAttributeValues (:+name).
 * Supports simple comparison clauses and begins_with(...).
 */
function normalizeFilterExpression(
  filter: string,
  existingAttributes: Record<string, any> = {}
): { expression: string; attributes: Record<string, any> } {
  const attributes: Record<string, any> = {};

  // Split on AND/OR while keeping the separators
  const parts = filter.split(/(\s+(?:AND|OR)\s+)/i);

  const parsedParts = parts.map((part) => {
    const trimmed = part.trim();

    // Preserve separators (AND/OR)
    if (/^(AND|OR)$/i.test(trimmed)) return trimmed;

    // begins_with(attr, val) style
    const beginsMatch = trimmed.match(/^begins_with\((\w+)\s*,\s*(.+)\)$/i);
    if (beginsMatch) {
      const field = beginsMatch[1];
      let val = beginsMatch[2].trim();
      // Remove surrounding quotes if present
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.substring(1, val.length - 1);
      }
      if (val.startsWith(":")) {
        // value is already a placeholder
        return `begins_with(#${field}, ${val})`;
      }
      // prefer existing attribute value if provided
      if (existingAttributes[field] !== undefined) {
        attributes[field] = existingAttributes[field];
      } else {
        attributes[field] = parseValue(val);
      }
      return `begins_with(#${field}, :${field})`;
    }

    // comparison operators
    const compMatch = trimmed.match(/^(\w+)\s*(=|!=|<=|>=|<|>)\s*(.+)$/);
    if (compMatch) {
      const field = compMatch[1];
      const op = compMatch[2];
      let val = compMatch[3].trim();

      // If value is already a placeholder like :val, leave as-is
      if (val.startsWith(":")) {
        return `#${field} ${op} ${val}`;
      }

      // Strip quotes for literal strings
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.substring(1, val.length - 1);
      }

      // prefer existing attribute value if provided
      if (existingAttributes[field] !== undefined) {
        attributes[field] = existingAttributes[field];
      } else {
        attributes[field] = parseValue(val);
      }

      return `#${field} ${op} :${field}`;
    }

    // If nothing matched, return original part (Dynamo placeholders may already be used)
    return part;
  });

  return { expression: parsedParts.join(" "), attributes };
}

function parseValue(val: string): any {
  // Try to parse numbers
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  // Otherwise treat as string
  return val;
}
