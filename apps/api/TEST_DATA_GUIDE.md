# Test Data Guide

This guide explains how to use the test data functionality in the database management script.

## Quick Start

1. **Build the script:**
   ```bash
   cd apps/api
   npm run build
   ```

2. **Insert test data:**
   ```bash
   npm run db:manage insert-test-data
   ```

## What Gets Created

When you run `insert-test-data`, the following test data is created:

### Users (3 users)
- **test1@example.com** - Organization Owner
- **test2@example.com** - Organization Admin  
- **test3@example.com** - Organization Member

**Password for all test users:** `TestPassword123!`

### Organization (1 organization)
- **Test Organization** (slug: `test-organization`)
- Owner: test1@example.com

### Projects (2 projects)
- **Test Project 1** (key: `TST`) - For development and testing
- **Test Project 2** (key: `DEV`) - For QA testing

### Tasks (4 tasks)
- **TST-1**: Test authentication flow (IN_PROGRESS, HIGH priority)
- **TST-2**: Test user management (TODO, MEDIUM priority)
- **TST-3**: Test project dashboard (DONE, LOW priority)
- **DEV-1**: Test API endpoints (IN_REVIEW, URGENT priority)

### Comments (3 comments)
- Comments on TST-1 from test2 and test1
- Comment on TST-2 from test3

## Usage Examples

### 1. Testing Authentication
```bash
# Insert test data
npm run db:manage insert-test-data

# Use these credentials to test login:
# Email: test1@example.com
# Password: TestPassword123!
```

### 2. Testing Project Management
```bash
# The test data includes:
# - 2 projects with different keys (TST, DEV)
# - 4 tasks with various statuses and priorities
# - 3 users with different organization roles
```

### 3. Testing Task Comments
```bash
# Test data includes comments on tasks:
# - TST-1 has 2 comments
# - TST-2 has 1 comment
```

### 4. Testing Role-Based Access
```bash
# Test different permission levels:
# - test1@example.com: Organization Owner (full access)
# - test2@example.com: Organization Admin (admin access)
# - test3@example.com: Organization Member (member access)
```

## Cleaning Up Test Data

To remove test data and start fresh:

```bash
# Drop all collections (removes ALL data, including test data)
npm run db:manage drop-collections

# Or manually remove specific test users
npm run db:manage list-users
# Then delete specific test users as needed
```

## Combining with Other Commands

### Complete Test Setup
```bash
# 1. Create collections
npm run db:manage create-collections

# 2. Insert test data
npm run db:manage insert-test-data

# 3. Verify data
npm run db:manage list-collections
npm run db:manage list-users
```

### Adding Custom Test Users
```bash
# Insert standard test data first
npm run db:manage insert-test-data

# Add additional custom test users
npm run db:manage add-user --name="Custom Test User" --email="custom@example.com" --password="CustomPassword123!"
```

## Test Data Summary

After running `insert-test-data`, you'll have:

| Collection | Documents | Description |
|------------|-----------|-------------|
| users | 3 | Test users with different roles |
| organizations | 1 | Test organization |
| organization-members | 3 | Organization memberships |
| projects | 2 | Test projects |
| project-members | 3 | Project memberships |
| tasks | 4 | Test tasks with various states |
| comments | 3 | Test comments on tasks |

## Security Notes

- Test data uses a simple password (`TestPassword123!`) for convenience
- **Never use test credentials in production**
- Test data should only be used in development/staging environments
- Remember to clean up test data before deploying to production

## Troubleshooting

### Duplicate Data Error
If you run `insert-test-data` multiple times, you might get duplicate key errors:
```bash
# Solution: Drop collections first
npm run db:manage drop-collections
npm run db:manage insert-test-data
```

### Connection Issues
Ensure your `.env` file has the correct MongoDB connection string:
```bash
# Check connection
npm run db:manage list-collections
```

### Missing Collections
If collections don't exist:
```bash
# Create collections first
npm run db:manage create-collections
npm run db:manage insert-test-data
```

## Next Steps

After inserting test data, you can:

1. **Test your API endpoints** using the test users
2. **Verify data relationships** through the web interface
3. **Test authentication flows** with different user roles
4. **Develop and test features** with realistic data
5. **Run automated tests** against the test dataset

For more database management commands, see [DATABASE_MANAGEMENT.md](./DATABASE_MANAGEMENT.md)