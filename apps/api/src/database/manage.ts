/**
 * Database Management Script
 * 
 * This script provides utilities to:
 * - Connect to MongoDB Cloud using the .env configuration
 * - Create/update collections (tables)
 * - Manage user data
 * - Run database operations
 * 
 * Usage:
 * - Build the API first: npm run build (from apps/api directory)
 * - Run: node dist/database/manage.js [command]
 * 
 * Commands:
 * - create-collections: Create all collections with proper indexes
 * - drop-collections: Drop all collections (use with caution)
 * - list-collections: List all collections in the database
 * - add-user: Add a new user (requires: name, email, password)
 * - list-users: List all users
 * - update-user: Update user password (requires: email, new-password)
 * 
 * Examples:
 * node dist/database/manage.js create-collections
 * node dist/database/manage.js add-user --name="John Doe" --email="john@example.com" --password="password123"
 * node dist/database/manage.js update-user --email="john@example.com" --new-password="newpassword123"
 */

import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import * as bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { UserSchema } from '../users/schemas/user.schema';
import { OrganizationSchema } from '../organizations/schemas/organization.schema';
import { OrganizationMemberSchema } from '../organization-members/schemas/organization-member.schema';
import { ProjectSchema } from '../projects/schemas/project.schema';
import { ProjectMemberSchema } from '../project-members/schemas/project-member.schema';
import { TaskSchema } from '../tasks/schemas/task.schema';
import { CommentSchema } from '../comments/schemas/comment.schema';
import { OrganizationRole, ProjectRole, TaskPriority, TaskStatus } from '@projectflow/shared';

// Load environment variables
loadEnv({ path: resolve(__dirname, '../../../../.env'), quiet: true });
loadEnv({ quiet: true });

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/projectflow';

// Define models
const User = mongoose.model('User', UserSchema);
const Organization = mongoose.model('Organization', OrganizationSchema);
const OrganizationMember = mongoose.model('OrganizationMember', OrganizationMemberSchema);
const Project = mongoose.model('Project', ProjectSchema);
const ProjectMember = mongoose.model('ProjectMember', ProjectMemberSchema);
const Task = mongoose.model('Task', TaskSchema);
const Comment = mongoose.model('Comment', CommentSchema);

// Collection definitions with their model names
const collections = [
  { name: 'users', modelName: 'User' },
  { name: 'organizations', modelName: 'Organization' },
  { name: 'organization-members', modelName: 'OrganizationMember' },
  { name: 'projects', modelName: 'Project' },
  { name: 'project-members', modelName: 'ProjectMember' },
  { name: 'tasks', modelName: 'Task' },
  { name: 'comments', modelName: 'Comment' },
];

/**
 * Connect to MongoDB
 */
async function connectToDatabase(): Promise<void> {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`✅ Connected to MongoDB: ${MONGODB_URI}`);
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    throw error;
  }
}

/**
 * Disconnect from MongoDB
 */
async function disconnectFromDatabase(): Promise<void> {
  try {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Failed to disconnect from MongoDB:', error);
  }
}

/**
 * Create all collections with proper indexes
 */
async function createCollections(): Promise<void> {
  console.log('📋 Creating collections and indexes...');

  for (const collection of collections) {
    try {
      // Ensure indexes are created
      const Model = mongoose.model(collection.modelName);
      await Model.createIndexes();
      console.log(`  ✅ Created indexes for ${collection.name}`);
    } catch (error) {
      console.error(`  ❌ Error creating indexes for ${collection.name}:`, error);
    }
  }

  console.log('✅ Collections and indexes created successfully');
}

/**
 * Drop all collections (use with caution)
 */
async function dropCollections(): Promise<void> {
  console.log('⚠️  WARNING: This will delete all data in the database!');
  console.log('📋 Dropping all collections...');

  for (const collection of collections) {
    try {
      const Model = mongoose.model(collection.name);
      await Model.deleteMany({});
      console.log(`  ✅ Dropped ${collection.name}`);
    } catch (error) {
      console.error(`  ❌ Error dropping ${collection.name}:`, error);
    }
  }

  console.log('✅ All collections dropped successfully');
}

/**
 * List all collections in the database
 */
async function listCollections(): Promise<void> {
  console.log('📋 Listing collections...');

  try {
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not established');
    }

    const collectionNames = await db.listCollections().toArray();
    console.log(`\nFound ${collectionNames.length} collections:\n`);

    for (const collection of collectionNames) {
      console.log(`  - ${collection.name}`);
    }

    // Count documents in each collection
    console.log('\nDocument counts:\n');
    for (const collection of collections) {
      try {
        const Model = mongoose.model(collection.modelName);
        const count = await Model.countDocuments();
        console.log(`  ${collection.name}: ${count} documents`);
      } catch (error) {
        console.log(`  ${collection.name}: Error counting documents`);
      }
    }
  } catch (error) {
    console.error('❌ Error listing collections:', error);
  }
}

/**
 * Add a new user
 */
async function addUser(name: string, email: string, password: string): Promise<void> {
  console.log(`👤 Adding user: ${email}`);

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log(`❌ User with email ${email} already exists`);
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await User.create({
      name,
      email,
      passwordHash,
      avatarUrl: null,
    });

    console.log(`✅ User created successfully (ID: ${user._id})`);
  } catch (error) {
    console.error('❌ Error adding user:', error);
  }
}

/**
 * List all users
 */
async function listUsers(): Promise<void> {
  console.log('👥 Listing users...\n');

  try {
    const users = await User.find({}, { passwordHash: 0 }).sort({ createdAt: -1 });

    if (users.length === 0) {
      console.log('No users found');
      return;
    }

    console.log(`Found ${users.length} users:\n`);

    for (const user of users) {
      console.log(`  ID: ${user._id}`);
      console.log(`  Name: ${user.name}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Avatar: ${user.avatarUrl || 'None'}`);
      console.log(`  Created: ${user.createdAt}`);
      console.log(`  Updated: ${user.updatedAt}`);
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error listing users:', error);
  }
}

/**
 * Update user password
 */
async function updateUserPassword(email: string, newPassword: string): Promise<void> {
  console.log(`🔐 Updating password for: ${email}`);

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`❌ User with email ${email} not found`);
      return;
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update user
    await User.updateOne({ email }, { passwordHash });

    console.log(`✅ Password updated successfully for ${email}`);
  } catch (error) {
    console.error('❌ Error updating user password:', error);
  }
}

/**
 * Insert test data into the database
 */
async function insertTestData(): Promise<void> {
  console.log('🧪 Inserting test data...');

  const TEST_PASSWORD = 'TestPassword123!';
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  try {
    // Create test users
    const testUsers = [
      { name: 'Test User 1', email: 'test1@example.com', passwordHash, avatarUrl: null },
      { name: 'Test User 2', email: 'test2@example.com', passwordHash, avatarUrl: null },
      { name: 'Test User 3', email: 'test3@example.com', passwordHash, avatarUrl: null },
    ];

    const users = await User.insertMany(testUsers);
    console.log(`✅ Created ${users.length} test users`);

    const userIdByEmail = new Map(users.map((user) => [user.email, user._id as Types.ObjectId]));
    const getUserId = (email: string): Types.ObjectId => {
      const id = userIdByEmail.get(email);
      if (!id) throw new Error(`Test user missing: ${email}`);
      return id;
    };

    const testUser1 = getUserId('test1@example.com');
    const testUser2 = getUserId('test2@example.com');
    const testUser3 = getUserId('test3@example.com');

    // Create test organization
    const organization = await Organization.create({
      name: 'Test Organization',
      slug: 'test-organization',
      ownerId: testUser1,
    });
    console.log(`✅ Created test organization: ${organization.name}`);

    // Create organization members
    await OrganizationMember.insertMany([
      { organizationId: organization._id, userId: testUser1, role: OrganizationRole.OWNER },
      { organizationId: organization._id, userId: testUser2, role: OrganizationRole.ADMIN },
      { organizationId: organization._id, userId: testUser3, role: OrganizationRole.MEMBER },
    ]);
    console.log(`✅ Created organization members`);

    // Create test projects
    const projects = await Project.insertMany([
      {
        organizationId: organization._id,
        name: 'Test Project 1',
        key: 'TST',
        description: 'A test project for development and testing purposes',
        createdBy: testUser1,
      },
      {
        organizationId: organization._id,
        name: 'Test Project 2',
        key: 'DEV',
        description: 'Another test project for QA testing',
        createdBy: testUser2,
      },
    ]);
    console.log(`✅ Created ${projects.length} test projects`);

    if (!projects[0] || !projects[1]) {
      throw new Error('Failed to create test projects');
    }

    // Create project members
    await ProjectMember.insertMany([
      { projectId: projects[0]._id, userId: testUser2, role: ProjectRole.PROJECT_MANAGER },
      { projectId: projects[0]._id, userId: testUser3, role: ProjectRole.MEMBER },
      { projectId: projects[1]._id, userId: testUser1, role: ProjectRole.MEMBER },
    ]);
    console.log(`✅ Created project members`);

    // Create test tasks
    const tasks = await Task.insertMany([
      {
        projectId: projects[0]._id,
        number: 1,
        key: 'TST-1',
        title: 'Test authentication flow',
        description: 'Test the complete authentication flow including login, logout, and token refresh',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        createdBy: testUser1,
      },
      {
        projectId: projects[0]._id,
        number: 2,
        key: 'TST-2',
        title: 'Test user management',
        description: 'Test user creation, updates, and deletion functionality',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        createdBy: testUser2,
      },
      {
        projectId: projects[0]._id,
        number: 3,
        key: 'TST-3',
        title: 'Test project dashboard',
        description: 'Test the project dashboard rendering and responsiveness',
        status: TaskStatus.DONE,
        priority: TaskPriority.LOW,
        createdBy: testUser3,
      },
      {
        projectId: projects[1]._id,
        number: 1,
        key: 'DEV-1',
        title: 'Test API endpoints',
        description: 'Test all API endpoints for proper responses and error handling',
        status: TaskStatus.IN_REVIEW,
        priority: TaskPriority.URGENT,
        createdBy: testUser2,
      },
    ]);
    console.log(`✅ Created ${tasks.length} test tasks`);

    if (!tasks[0] || !tasks[1]) {
      throw new Error('Failed to create test tasks');
    }

    // Create test comments
    await Comment.insertMany([
      {
        taskId: tasks[0]._id,
        authorId: testUser2,
        content: 'Test comment on authentication flow - looks good so far',
      },
      {
        taskId: tasks[0]._id,
        authorId: testUser1,
        content: 'Added additional test cases for edge cases',
      },
      {
        taskId: tasks[1]._id,
        authorId: testUser3,
        content: 'Test comment for user management task',
      },
    ]);
    console.log(`✅ Created test comments`);

    console.log('\n🎉 Test data inserted successfully!');
    console.log(`\n📝 Test Credentials:`);
    console.log(`   Email: test1@example.com, test2@example.com, test3@example.com`);
    console.log(`   Password: ${TEST_PASSWORD}`);
    console.log(`\n📊 Summary:`);
    console.log(`   Users: ${users.length}`);
    console.log(`   Organizations: 1`);
    console.log(`   Projects: ${projects.length}`);
    console.log(`   Tasks: ${tasks.length}`);
    console.log(`   Comments: 3`);
  } catch (error) {
    console.error('❌ Error inserting test data:', error);
    throw error;
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): { command: string; options: Record<string, string> } {
  const command = args[0] || 'help';
  const options: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg && arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value && key) {
        options[key] = value;
      }
    }
  }

  return { command, options };
}

/**
 * Show help
 */
function showHelp(): void {
  console.log(`
Database Management Script

Usage: node dist/database/manage.js [command] [options]

Commands:
  create-collections    Create all collections with proper indexes
  drop-collections      Drop all collections (use with caution)
  list-collections      List all collections in the database
  add-user              Add a new user
  list-users            List all users
  update-user           Update user password
  insert-test-data      Insert test/placeholder data for testing
  help                  Show this help message

Options for add-user:
  --name="Full Name"      User's full name
  --email="user@example.com"  User's email address
  --password="password123"     User's password

Options for update-user:
  --email="user@example.com"  User's email address
  --new-password="password123" New password

Examples:
  node dist/database/manage.js create-collections
  node dist/database/manage.js add-user --name="John Doe" --email="john@example.com" --password="password123"
  node dist/database/manage.js list-users
  node dist/database/manage.js update-user --email="john@example.com" --new-password="newpassword123"
  node dist/database/manage.js insert-test-data
  node dist/database/manage.js drop-collections
`);
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, options } = parseArgs(args);

  // Handle help command without database connection
  if (command === 'help') {
    showHelp();
    return;
  }

  try {
    await connectToDatabase();

    switch (command) {
      case 'create-collections':
        await createCollections();
        break;

      case 'drop-collections':
        await dropCollections();
        break;

      case 'list-collections':
        await listCollections();
        break;

      case 'add-user':
        if (!options.name || !options.email || !options.password) {
          console.error('❌ Missing required options for add-user: --name, --email, --password');
          showHelp();
          process.exit(1);
        }
        await addUser(options.name, options.email, options.password);
        break;

      case 'list-users':
        await listUsers();
        break;

      case 'update-user':
        if (!options.email || !options['new-password']) {
          console.error('❌ Missing required options for update-user: --email, --new-password');
          showHelp();
          process.exit(1);
        }
        await updateUserPassword(options.email, options['new-password']);
        break;

      case 'insert-test-data':
        await insertTestData();
        break;

      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await disconnectFromDatabase();
  }
}

// Run the script
main().catch(async (error: unknown) => {
  console.error('❌ Unhandled error:', error);
  await disconnectFromDatabase();
  process.exit(1);
});