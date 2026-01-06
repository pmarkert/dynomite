# Dynomite

A powerful CLI tool for DynamoDB table migration and management operations.

## Features

- **Copy** - Copy data from one DynamoDB table to another with optional filtering
- **Export** - Export DynamoDB table data to JSON files
- **Import** - Import JSON data into DynamoDB tables
- **Delete** - Safely delete items from tables with confirmation prompts
- **Interactive prompts** - User-friendly interface for table and file selection
- **Advanced filtering** - Support for partition keys, sort keys, indexes, and custom filter expressions
- **Batch operations** - Efficient batch processing for large datasets
- **Shell completion** - Auto-completion support for improved CLI experience

## Installation

### Prerequisites

- Node.js 18+
- AWS credentials configured (via environment variables, AWS CLI, or IAM role)
- [Carapace](https://carapace-sh.github.io/carapace-bin/) (optional, for shell completion support)

### Install from source

```bash
git clone <repository-url>
cd dynomite
npm install
npm run build
npm link  # Optional: makes 'dynomite' available globally
```

## Configuration

Configure AWS credentials in your environment using the standard methods.

## Usage

### Basic Commands

```bash
# Show help
dynomite --help

# Show version
dynomite --version
```

#### Shell Completion Setup

To enable shell auto-completion, first install [Carapace](https://carapace-sh.github.io/carapace-bin/):

**macOS (Homebrew):**

```bash
brew install carapace
```

**Linux:**

```bash
# Download and install the latest release from:
# https://github.com/carapace-sh/carapace-bin/releases
```

or use your package manager if available.

```bash
brew install carapace  # macOS
```

**Activate completion for dynomite:**

Run the completion command to install the completion spec:

```bash
dynomite completion
```

Then restart your shell or reload your configuration:

Now you can use Tab to autocomplete commands and options:

```bash
dynomite <TAB>        # Shows: copy, delete, export, import
dynomite copy --<TAB> # Shows available options
```

### Copy Command

Copy all or filtered data from one table to another:

```bash
# Interactive mode - prompts for table selection
dynomite copy

# Specify tables via options
dynomite copy --from source-table --to destination-table

# Copy with partition key filter
dynomite copy --from users --to users-backup \
  --pk "userId=123"

# Copy with partition and sort key filters
dynomite copy --from orders --to orders-archive \
  --pk "customerId=456" \
  --sk "orderDate > 2023-01-01"

# Copy using a global secondary index
dynomite copy --from products --to products-backup \
  --index EmailIndex \
  --pk "email=user@example.com"

# Copy with additional filter expression
dynomite copy --from users --to active-users \
  --pk "status=active" \
  --filter "age > :minAge AND country = :country" \
  --filter-attrs "minAge=18,country=US"
```

### Export Command

Export table data to a JSON file:

```bash
# Interactive mode
dynomite export

# Specify table and output file
dynomite export --table users --output users.json

# Export with filtering
dynomite export --table orders \
  --output recent-orders.json \
  --pk "customerId=123" \
  --sk "orderDate > 2024-01-01"

# Export to stdout (useful for piping)
dynomite export --table users
```

### Import Command

Import JSON data into a DynamoDB table:

```bash
# Interactive mode - prompts for file selection
dynomite import --table users

# Specify input file
dynomite import --table users --input users.json

# Import from stdin
cat users.json | dynomite import --table users
```

**JSON format**: The input file should contain an array of items:

```json
[
  {
    "userId": "123",
    "name": "John Doe",
    "email": "john@example.com"
  },
  {
    "userId": "456",
    "name": "Jane Smith",
    "email": "jane@example.com"
  }
]
```

### Delete Command

Delete items from a table with safety confirmations:

```bash
# Interactive mode with confirmation
dynomite delete --table users \
  --pk "userId=123"

# Delete with filter expression
dynomite delete --table users \
  --filter "lastLogin < :cutoffDate" \
  --filter-attrs "cutoffDate=2023-01-01"

# Preview items before deletion
# When prompted, enter 'p' to preview keys before confirming
dynomite delete --table users --pk "status=inactive"
```

## Filter Options

All commands support advanced filtering:

### Partition Key

## Error Handling

Dynomite now formats runtime errors to be more user-friendly. By default you'll see a concise error message and a hint when common AWS configuration problems are detected (for example missing region or credentials).

If you need full debugging information including stack traces, enable the debug output by setting `DEBUG=1` in your environment before running a command:

```bash
DEBUG=1 dynomite export --table users --output users.json
```

This will print the full error stack to help with troubleshooting.

```bash
--pk "keyName=value"
```

### Sort Key

Supports operators: `=`, `<`, `<=`, `>`, `>=`, `begins_with`, `between`

```bash
--sk "timestamp > 2024-01-01"
--sk "name begins_with John"
--sk "age between 18,65"
```

### Index

```bash
--index "IndexName"
```

### Filter Expression

Additional filtering with custom expressions:

```bash
--filter "attribute_exists(email) AND age > :minAge"
--filter-attrs "minAge=18"
```

The `--filter-attrs` option accepts comma-separated key=value pairs that are used as expression attribute values.

You can also supply simple user-friendly filters without writing Dynamo placeholders. The CLI will automatically convert these into safe ExpressionAttributeName and ExpressionAttributeValue placeholders to avoid DynamoDB reserved word conflicts. Examples:

```bash
# Simple equality on a reserved word field (e.g. 'type')
dynomite export --filter "type=goal" --table my-table --output out.json

# begins_with usage (also supported):
dynomite export --filter "begins_with(title, 'Intro')" --table my-table

# Combined expressions using AND/OR:
dynomite export --filter "type=goal AND begins_with(title, 'Intro')"
```

## Environment Variables

You can set default values using environment variables:

```bash
export FROM_TABLE=source-table
export TO_TABLE=destination-table
export TABLE_NAME=my-table
```

## Examples

### Migrate production data to staging

```bash
# Export production data
dynomite export --table prod-users --output users-backup.json

# Import to staging
dynomite import --table staging-users --input users-backup.json
```

### Copy specific user records

```bash
dynomite copy \
  --from users \
  --to premium-users \
  --filter "accountType = :type AND subscriptionStatus = :status" \
  --filter-attrs "type=premium,status=active"
```

### Archive old records

```bash
# Export old records
dynomite export --table orders \
  --output archived-orders.json \
  --filter "orderDate < :cutoff" \
  --filter-attrs "cutoff=2023-01-01"

# Delete old records after verification
dynomite delete --table orders \
  --filter "orderDate < :cutoff" \
  --filter-attrs "cutoff=2023-01-01"
```

### Backup before migration

```bash
# Create backup
dynomite copy --from users --to users-backup-2026-01-05

# Perform migration/transformation
# ... your migration logic ...

# If needed, restore from backup
dynomite copy --from users-backup-2026-01-05 --to users
```

## Development

### Build

```bash
npm run build
```

### Run in development

```bash
npm run dev -- <command> [options]
```

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT

## Author

Phillip Markert
