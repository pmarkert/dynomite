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
  --pk "123"

# Copy with partition and sort key filters
dynomite copy --from orders --to orders-archive \
  --pk "456" \
  --sk "orderDate > 2023-01-01"

# Copy using a global secondary index
dynomite copy --from products --to products-backup \
  --index EmailIndex \
  --pk "user@example.com"

# Copy with additional filter expression
dynomite copy --from users --to active-users \
  --pk "active" \
  --filter "age>18 AND country='US'"
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
  --pk "123" \
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
  --pk "123"

# Delete with filter expression
dynomite delete --table users \
  --filter "lastLogin<'2023-01-01'"

# Preview items before deletion
# When prompted, enter 'p' to preview keys before confirming
dynomite delete --table users --pk "inactive"
```

## Filter Options

All commands support advanced filtering:

### Partition Key

Provide the partition key value directly (equality only):

```bash
--pk "keyValue"
```

Examples:

```bash
--pk "123"
--pk "user@example.com"
--pk "active"
```

### Sort Key

Supports operators: `=`, `<`, `<=`, `>`, `>=`, `begins_with(...)`, `between(...,...)`. Operator spacing is optional (e.g. `>=100` or `>= 100`).

```bash
--sk "timestamp > 2024-01-01"
--sk ">=100"
--sk ">= 100"
--sk "begins_with(2023-)"
--sk "between(18,65)"
```

### Index

```bash
--index "IndexName"
```

### Filter Expression

Additional filtering with custom expressions using inline values:

```bash
--filter "attribute_exists(email) AND age>18"
--filter "status='active' AND score>=100"
```

The CLI automatically converts filter expressions into safe ExpressionAttributeName and ExpressionAttributeValue placeholders to avoid DynamoDB reserved word conflicts.

**Supported operators and functions:**

- **Comparison operators**: `=`, `!=`, `<`, `<=`, `>`, `>=`
- **String functions**: `begins_with(attr,'value')`, `contains(attr,'value')`
- **Range function**: `between(attr,val1,val2)`
- **Existence functions**: `attribute_exists(attr)`, `attribute_not_exists(attr)`
- **Size function**: `size(attr)` with comparison operators
- **IN operator**: `attr IN (val1,val2,val3)`
- **Logical operators**: `AND`, `OR`

**Examples:**

```bash
# Simple equality and comparison
dynomite export --filter "type='goal'" --table my-table --output out.json
dynomite export --filter 'orderId<25' --table my-table

# String matching
dynomite export --filter "begins_with(title,'Intro')" --table my-table
dynomite export --filter "contains(tags,'premium')" --table my-table

# Range and inequality
dynomite export --filter "between(age,18,65)" --table my-table
dynomite export --filter "status!='deleted'" --table my-table

# Attribute existence
dynomite export --filter "attribute_exists(email)" --table my-table
dynomite export --filter "attribute_not_exists(deletedAt)" --table my-table

# Size comparisons
dynomite export --filter "size(items)>5" --table my-table

# IN operator
dynomite export --filter "status IN ('active','pending','approved')" --table my-table

# Boolean and null values
dynomite export --filter "isActive=true" --table my-table
dynomite export --filter "deletedAt=null" --table my-table

# Combined expressions using AND/OR:
dynomite export --filter "type='goal' AND begins_with(title,'Intro')" --table my-table
dynomite export --filter "age>=18 AND status IN ('active','pending')" --table my-table
```

## Error Handling

Dynomite formats runtime errors to be more user-friendly. By default you'll see a concise error message and a hint when common AWS configuration problems are detected (for example missing region or credentials).

If you need full debugging information including stack traces, enable the debug output by setting `DEBUG=1` in your environment before running a command:

```bash
DEBUG=1 dynomite export --table users --output users.json
```

This will print the full error stack to help with troubleshooting.

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
  --filter "accountType='premium' AND subscriptionStatus='active'"
```

### Archive old records

```bash
# Export old records
dynomite export --table orders \
  --output archived-orders.json \
  --filter "orderDate<'2023-01-01'"

# Delete old records after verification
dynomite delete --table orders \
  --filter "orderDate<'2023-01-01'"
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
