# Test Data Guide

This guide explains how to use the test data functionality in the database management script.

## Quick Start

The test data is automatically created when you deploy to Railway or run the seed script locally.

### Option 1: Railway Deployment (Automatic)
When you deploy to Railway, the seed script runs automatically and creates test users.

### Option 2: Local Development
```bash
cd apps/api
npm run build
npm run seed
```

## What Gets Created

When the seed script runs, the following test data is created:

### Users (5 users)
- **ammar@example.com** - Organization Owner
- **sarah@example.com** - Organization Admin
- **ahmed@example.com** - Organization Member
- **magd@example.com** - Organization Member
- **outside@example.com** - No organization access

**Password for all test users:** `Password123!`

### Organization (1 organization)
- **Acme Software** (slug: `acme-software`)
- Owner: ammar@example.com

### Projects (2 projects)
- **Internal Platform** (key: `ENG`) - Core internal tooling
- **Customer Portal** (key: `WEB`) - Customer-facing portal

### Tasks (9 tasks)
#### Internal Platform Tasks:
- **ENG-1**: Implement authentication refresh flow (IN_PROGRESS, HIGH priority)
- **ENG-2**: Improve project dashboard responsiveness (TODO, MEDIUM priority)
- **ENG-3**: Add project member search (TODO, LOW priority)
- **ENG-4**: Fix mobile sidebar behaviour (IN_REVIEW, URGENT priority)
- **ENG-5**: Improve API error handling (DONE, MEDIUM priority)
- **ENG-6**: Document local development setup (TODO, LOW priority)

#### Customer Portal Tasks:
- **WEB-1**: Billing history pagination (IN_PROGRESS, HIGH priority)
- **WEB-2**: Support dark mode in the portal shell (TODO, LOW priority)
- **WEB-3**: Account deletion confirmation step (IN_REVIEW, URGENT priority)

### Comments (5 comments)
- Comments on ENG-1 from sarah and ammar
- Comment on ENG-2 from magd
- Comment on ENG-4 from ahmed
- Comment on WEB-3 from magd

## Usage Examples

### 1. Testing Authentication
```bash
# The seed script runs automatically on Railway deployment
# Or run locally: npm run seed

# Use these credentials to test login:
# Email: ammar@example.com
# Password: Password123!
```

### 2. Testing Project Management
```bash
# The test data includes:
# - 2 projects with different keys (ENG, WEB)
# - 9 tasks with various statuses and priorities
# - 4 users with different organization roles
```

### 3. Testing Task Comments
```bash
# Test data includes comments on tasks:
# - ENG-1 has 2 comments
# - ENG-2 has 1 comment
# - ENG-4 has 1 comment
# - WEB-3 has 1 comment
```

### 4. Testing Role-Based Access
```bash
# Test different permission levels:
# - ammar@example.com: Organization Owner (full access)
# - sarah@example.com: Organization Admin (admin access)
# - ahmed@example.com: Organization Member (member access)
# - magd@example.com: Organization Member (member access)
# - outside@example.com: No organization access (for testing permissions)
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

# 2. Insert test data (or use seed script)
npm run seed

# 3. Verify data
npm run db:manage list-collections
npm run db:manage list-users
```

### Adding Custom Test Users
```bash
# Insert standard test data first
npm run seed

# Add additional custom test users
npm run db:manage add-user --name="Custom Test User" --email="custom@example.com" --password="CustomPassword123!"
```

## Test Data Summary

After running the seed script, you'll have:

| Collection | Documents | Description |
|------------|-----------|-------------|
| users | 5 | Test users with different roles |
| organizations | 1 | Test organization (Acme Software) |
| organization-members | 4 | Organization memberships |
| projects | 2 | Test projects (Internal Platform, Customer Portal) |
| project-members | 4 | Project memberships |
| tasks | 9 | Test tasks with various states |
| comments | 5 | Test comments on tasks |

## Security Notes

- Test data uses a simple password (`Password123!`) for convenience
- **Never use test credentials in production**
- Test data should only be used in development/staging environments
- Remember to clean up test data before deploying to production

## Troubleshooting

### Duplicate Data Error
If you run the seed script multiple times, you might get duplicate key errors:
```bash
# Solution: Drop collections first
npm run db:manage drop-collections
npm run seed
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
npm run seed
```

## Next Steps

After the seed script runs, you can:

1. **Test your API endpoints** using the test users
2. **Verify data relationships** through the web interface
3. **Test authentication flows** with different user roles
4. **Develop and test features** with realistic data
5. **Run automated tests** against the test dataset

## Quick Reference

### Login Credentials
```
Email: ammar@example.com
Password: Password123!
```

### Alternative Test Users
- sarah@example.com (Admin)
- ahmed@example.com (Member)
- magd@example.com (Member)
- outside@example.com (No organization access)

All use the same password: `Password123!`

For more database management commands, check the database management script help:
```bash
npm run db:manage help
```