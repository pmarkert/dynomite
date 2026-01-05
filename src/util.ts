import {
  QueryCommandOutput,
  ScanCommandOutput,
  DynamoDBClient,
  DescribeTableCommand,
  ListTablesCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

export const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export interface QueryOptions {
  partitionKey?: { name: string; value: any };
  sortKey?: { name: string; operator: string; value: any; value2?: any };
  indexName?: string;
  filterExpression?: string;
  filterAttributes?: Record<string, any>;
}

export interface KeySchema {
  partitionKey: string;
  sortKey?: string;
}

/**
 * Get list of all DynamoDB table names in the account
 */
export async function getTableNames(): Promise<string[]> {
  const tables: string[] = [];
  let lastEvaluatedTableName: string | undefined;

  do {
    const command = new ListTablesCommand({
      ExclusiveStartTableName: lastEvaluatedTableName,
    });
    const response = await new DynamoDBClient({}).send(command);

    if (response.TableNames) {
      tables.push(...response.TableNames);
    }
    lastEvaluatedTableName = response.LastEvaluatedTableName;
  } while (lastEvaluatedTableName);

  return tables;
}

export async function* queryTable(
  TableName: string,
  options: QueryOptions = {}
): AsyncGenerator<Record<string, any>> {
  const {
    partitionKey,
    sortKey,
    indexName,
    filterExpression,
    filterAttributes,
  } = options;

  let lastEvaluatedKey: Record<string, any> | undefined = undefined;

  // Build KeyConditionExpression if partition key is provided
  let KeyConditionExpression: string | undefined;
  const ExpressionAttributeNames: Record<string, string> = {};
  const ExpressionAttributeValues: Record<string, any> = {};

  if (partitionKey) {
    const pkPlaceholder = `#${partitionKey.name}`;
    const pkValuePlaceholder = `:${partitionKey.name}`;
    ExpressionAttributeNames[pkPlaceholder] = partitionKey.name;
    ExpressionAttributeValues[pkValuePlaceholder] = partitionKey.value;
    KeyConditionExpression = `${pkPlaceholder} = ${pkValuePlaceholder}`;

    // Add sort key condition if provided
    if (sortKey) {
      const skPlaceholder = `#${sortKey.name}`;
      const skValuePlaceholder = `:${sortKey.name}`;
      ExpressionAttributeNames[skPlaceholder] = sortKey.name;
      ExpressionAttributeValues[skValuePlaceholder] = sortKey.value;

      switch (sortKey.operator) {
        case "=":
          KeyConditionExpression += ` AND ${skPlaceholder} = ${skValuePlaceholder}`;
          break;
        case "<":
          KeyConditionExpression += ` AND ${skPlaceholder} < ${skValuePlaceholder}`;
          break;
        case "<=":
          KeyConditionExpression += ` AND ${skPlaceholder} <= ${skValuePlaceholder}`;
          break;
        case ">":
          KeyConditionExpression += ` AND ${skPlaceholder} > ${skValuePlaceholder}`;
          break;
        case ">=":
          KeyConditionExpression += ` AND ${skPlaceholder} >= ${skValuePlaceholder}`;
          break;
        case "begins_with":
          KeyConditionExpression += ` AND begins_with(${skPlaceholder}, ${skValuePlaceholder})`;
          break;
        case "between":
          const skValuePlaceholder2 = `:${sortKey.name}2`;
          ExpressionAttributeValues[skValuePlaceholder2] = sortKey.value2;
          KeyConditionExpression += ` AND ${skPlaceholder} BETWEEN ${skValuePlaceholder} AND ${skValuePlaceholder2}`;
          break;
        default:
          throw new Error(`Unsupported sort key operator: ${sortKey.operator}`);
      }
    }
  }

  // Add filter attributes to expression values
  if (filterAttributes) {
    for (const [key, value] of Object.entries(filterAttributes)) {
      ExpressionAttributeValues[`:${key}`] = value;
      // Also add to attribute names if they might conflict
      if (!ExpressionAttributeNames[`#${key}`]) {
        ExpressionAttributeNames[`#${key}`] = key;
      }
    }
  }

  do {
    // Use QueryCommand if KeyConditionExpression exists, otherwise ScanCommand
    const response: QueryCommandOutput | ScanCommandOutput =
      KeyConditionExpression
        ? await dynamoClient.send(
            new QueryCommand({
              TableName,
              IndexName: indexName,
              KeyConditionExpression,
              ...(Object.keys(ExpressionAttributeNames).length > 0 && {
                ExpressionAttributeNames,
              }),
              ...(Object.keys(ExpressionAttributeValues).length > 0 && {
                ExpressionAttributeValues,
              }),
              FilterExpression: filterExpression,
              ExclusiveStartKey: lastEvaluatedKey,
            })
          )
        : await dynamoClient.send(
            new ScanCommand({
              TableName,
              ...(Object.keys(ExpressionAttributeNames).length > 0 && {
                ExpressionAttributeNames,
              }),
              ...(Object.keys(ExpressionAttributeValues).length > 0 && {
                ExpressionAttributeValues,
              }),
              FilterExpression: filterExpression,
              ExclusiveStartKey: lastEvaluatedKey,
            })
          );
    for (const item of response.Items || []) {
      yield item;
    }
    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);
}

/**
 * Get the key schema for a table using DescribeTable
 */
export async function getTableKeySchema(tableName: string): Promise<KeySchema> {
  const describeCommand = new DescribeTableCommand({
    TableName: tableName,
  });

  const response = await dynamoClient.send(describeCommand);

  if (!response.Table?.KeySchema) {
    throw new Error(`Could not retrieve key schema for table ${tableName}`);
  }

  const keySchema: KeySchema = { partitionKey: "" };

  for (const key of response.Table.KeySchema) {
    if (key.KeyType === "HASH") {
      keySchema.partitionKey = key.AttributeName!;
    } else if (key.KeyType === "RANGE") {
      keySchema.sortKey = key.AttributeName!;
    }
  }

  if (!keySchema.partitionKey) {
    throw new Error(`Could not find partition key for table ${tableName}`);
  }

  return keySchema;
}

/**
 * Extract primary key attributes from an item using the table's key schema
 */
export function extractKeys(
  item: Record<string, any>,
  keySchema: KeySchema
): Record<string, any> {
  const keys: Record<string, any> = {};

  // Extract partition key
  keys[keySchema.partitionKey] = item[keySchema.partitionKey];

  // Extract sort key if it exists
  if (keySchema.sortKey) {
    keys[keySchema.sortKey] = item[keySchema.sortKey];
  }

  return keys;
}
