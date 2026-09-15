# ProjectFlow API System Design & Endpoint Specification

## 1. System Overview & Architecture

ProjectFlow is a TypeScript monorepo built using NestJS for the backend API, Next.js (App Router) for the web application, and MongoDB (via Mongoose) for persistence. Shared types, DTOs, and utility interfaces are maintained within `@projectflow/shared`.

### High-Level Request Flow Architecture

```text
                                  ┌──────────────────────────┐
                                  │      Client (Next.js)    │
                                  └────────────┬─────────────┘
                                               │ HTTP Request (Bearer JWT)
                                               ▼
                                  ┌──────────────────────────┐
                                  │   Global JwtAuthGuard    │  <-- Checks @Public() decorator
                                  └────────────┬─────────────┘
                                               │ Validated User Payload
                                               ▼
                                  ┌──────────────────────────┐
                                  │     NestJS Controller    │  <-- Parses Params/Query/Body DTOs
                                  └────────────┬─────────────┘
                                               │ Service Invocation
                                               ▼
                                  ┌──────────────────────────┐
                                  │   ProjectAccessService   │  <-- Authorization Guard Boundary
                                  └────────────┬─────────────┘
                                               │ Asserted Access
                                               ▼
                                  ┌──────────────────────────┐
                                  │     Domain Services      │  <-- Business Logic & Validation
                                  └────────────┬─────────────┘
                                               │ Mongoose Operations
                                               ▼
                                  ┌──────────────────────────┐
                                  │      MongoDB Storage     │
                                  └──────────────────────────┘
```

---

## 2. Authentication & Authorization Architecture

### 2.1 Authentication
* **Mechanism**: JSON Web Tokens (JWT) passed via the `Authorization: Bearer <token>` header.
* **Global Guard**: `JwtAuthGuard` guards all routes by default unless explicitly decorated with `@Public()`.
* **User Context**: Handled via the custom `@CurrentUser()` decorator, which extracts the authenticated user ID from the request state.

### 2.2 Authorization Model
Authorization is evaluated at the service boundary using `ProjectAccessService`:

```text
                    Organization Membership
                    ├── OWNER / ADMIN  ─────────► Superuser access to ALL projects in Org
                    └── MEMBER
                         └── Explicit Project Membership
                              ├── PROJECT_MANAGER ──► Full Read/Write & Management access
                              └── MEMBER ───────────► Read & Task Creation/Self-Assignment access
```

#### Authorization Rules Table

| Role / Context | View Project & Tasks | Create Tasks | Modify Task Details | Update Task Status | Assign Other Members | Self Assign Task | Manage Project Members |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Org OWNER / ADMIN** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Project MANAGER** | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| **Project MEMBER** | Yes | Yes | Creator Only | Yes (Authorized) | No | Yes | No |
| **Non-Project Member** | No | No | No | No | No | No | No |

---

## 3. Data Schemas & Database Entities

### 3.1 Schemas Overview

#### `User`
```ts
{
  _id: ObjectId,
  name: string,
  email: string (unique, lowercase),
  passwordHash: string,
  avatarUrl: string | null,
  createdAt: Date,
  updatedAt: Date
}
```

#### `Organization`
```ts
{
  _id: ObjectId,
  name: string,
  slug: string (unique, lowercase),
  createdBy: ObjectId (ref: 'User'),
  createdAt: Date,
  updatedAt: Date
}
```

#### `OrganizationMember`
```ts
{
  _id: ObjectId,
  organizationId: ObjectId (ref: 'Organization'),
  userId: ObjectId (ref: 'User'),
  role: 'OWNER' | 'ADMIN' | 'MEMBER',
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { organizationId: 1, userId: 1 } (unique)
```

#### `Project`
```ts
{
  _id: ObjectId,
  organizationId: ObjectId (ref: 'Organization'),
  name: string,
  key: string (uppercase),
  description: string | null,
  createdBy: ObjectId (ref: 'User'),
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { organizationId: 1, key: 1 } (unique)
```

#### `ProjectMember`
```ts
{
  _id: ObjectId,
  projectId: ObjectId (ref: 'Project'),
  userId: ObjectId (ref: 'User'),
  role: 'PROJECT_MANAGER' | 'MEMBER',
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { projectId: 1, userId: 1 } (unique)
```

#### `Task`
```ts
{
  _id: ObjectId,
  projectId: ObjectId (ref: 'Project'),
  number: number,
  key: string,
  title: string,
  description: string | null,
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE',
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
  createdBy: ObjectId (ref: 'User'),
  assignee: ObjectId | null (ref: 'User'),
  createdAt: Date,
  updatedAt: Date
}
// Indexes:
// - { projectId: 1, number: 1 } (unique - concurrency protection)
// - { projectId: 1, status: 1 }
// - { createdAt: -1 }
```

#### `TaskSequence` *(Atomic Concurrency Counter)*
```ts
{
  _id: ObjectId,
  projectId: ObjectId (ref: 'Project', unique),
  seq: number
}
```

#### `TaskActivity` *(Assignee Activity Log)*
```ts
{
  _id: ObjectId,
  taskId: ObjectId (ref: 'Task'),
  projectId: ObjectId (ref: 'Project'),
  actorId: ObjectId (ref: 'User'),
  type: 'TASK_ASSIGNEE_CHANGED',
  metadata: {
    from: ObjectId | null,
    to: ObjectId | null
  },
  createdAt: Date
}
// Indexes: { taskId: 1, createdAt: -1 }
```

#### `Comment`
```ts
{
  _id: ObjectId,
  taskId: ObjectId (ref: 'Task'),
  authorId: ObjectId (ref: 'User'),
  content: string,
  createdAt: Date,
  updatedAt: Date
}
// Indexes: { taskId: 1, createdAt: 1 }
```

---

## 4. API Endpoint Specification (Requests & Responses)

### Common Standard Formats

#### Standard Error Response (`ApiErrorBody`)
```json
{
  "statusCode": 403,
  "message": "You do not have access to this project",
  "error": "Forbidden"
}
```

#### Standard Paginated Response (`Paginated<T>`)
```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

---

### 4.1 Authentication Endpoints (`/auth`)

#### `POST /auth/register`
* **Auth**: Public (`@Public()`)
* **Request Body**:
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "securepassword123"
}
```
* **Response Body** (`201 Created` - `AuthSession`):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "user": {
    "id": "660000000000000000000001",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "avatarUrl": null
  }
}
```

#### `POST /auth/login`
* **Auth**: Public (`@Public()`)
* **Request Body**:
```json
{
  "email": "jane@example.com",
  "password": "securepassword123"
}
```
* **Response Body** (`200 OK` - `AuthSession`):
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "user": {
    "id": "660000000000000000000001",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "avatarUrl": null
  }
}
```

#### `GET /auth/me`
* **Auth**: Bearer JWT
* **Response Body** (`200 OK` - `CurrentUser`):
```json
{
  "id": "660000000000000000000001",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "avatarUrl": null,
  "organizations": [
    {
      "id": "660000000000000000000010",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "role": "OWNER"
    }
  ]
}
```

---

### 4.2 Organizations Endpoints (`/organizations`)

#### `GET /organizations`
* **Auth**: Bearer JWT
* **Response Body** (`200 OK` - `Array<OrganizationSummary & { role: OrganizationRole }>`):
```json
[
  {
    "id": "660000000000000000000010",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "role": "OWNER"
  }
]
```

---

### 4.3 Projects Endpoints (`/projects`)

#### `GET /projects`
* **Auth**: Bearer JWT
* **Description**: Returns all projects accessible to the authenticated user.
* **Response Body** (`200 OK` - `ProjectSummary[]`):
```json
[
  {
    "id": "660000000000000000000100",
    "organizationId": "660000000000000000000010",
    "name": "Internal Platform",
    "key": "ENG",
    "description": "Core engineering platform",
    "memberCount": 5,
    "taskCount": 42,
    "createdAt": "2026-09-15T09:00:00.000Z",
    "updatedAt": "2026-09-15T12:00:00.000Z"
  }
]
```

#### `POST /projects`
* **Auth**: Bearer JWT (Requires Org OWNER/ADMIN)
* **Request Body**:
```json
{
  "organizationId": "660000000000000000000010",
  "name": "Internal Platform",
  "key": "ENG",
  "description": "Core engineering platform"
}
```
* **Response Body** (`201 Created` - `ProjectDetail`):
```json
{
  "id": "660000000000000000000100",
  "organizationId": "660000000000000000000010",
  "name": "Internal Platform",
  "key": "ENG",
  "description": "Core engineering platform",
  "memberCount": 1,
  "taskCount": 0,
  "createdAt": "2026-09-15T09:00:00.000Z",
  "updatedAt": "2026-09-15T09:00:00.000Z",
  "organization": {
    "id": "660000000000000000000010",
    "name": "Acme Corp",
    "slug": "acme-corp"
  },
  "createdBy": {
    "id": "660000000000000000000001",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "avatarUrl": null
  }
}
```

#### `GET /projects/:projectId`
* **Auth**: Bearer JWT (Project Member / Org Elevated)
* **Response Body** (`200 OK` - `ProjectDetail`)

#### `GET /projects/:projectId/members`
* **Auth**: Bearer JWT (Project Member / Org Elevated)
* **Response Body** (`200 OK` - `ProjectMemberEntry[]`):
```json
[
  {
    "id": "660000000000000000000200",
    "projectId": "660000000000000000000100",
    "role": "PROJECT_MANAGER",
    "user": {
      "id": "660000000000000000000001",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "avatarUrl": null
    },
    "createdAt": "2026-09-15T09:00:00.000Z"
  }
]
```

#### `POST /projects/:projectId/members`
* **Auth**: Bearer JWT (Project Manager / Org Elevated)
* **Request Body**:
```json
{
  "userId": "660000000000000000000002",
  "role": "MEMBER"
}
```
* **Response Body** (`201 Created` - `ProjectMemberEntry`)

---

### 4.4 Tasks Endpoints (`/tasks`)

#### `GET /projects/:projectId/tasks`
* **Auth**: Bearer JWT (Project Member / Org Elevated)
* **Query Parameters**:
  * `page` (optional, default: `1`)
  * `pageSize` (optional, default: `20`)
  * `status` (optional: `TODO` | `IN_PROGRESS` | `IN_REVIEW` | `DONE`)
  * `priority` (optional: `LOW` | `MEDIUM` | `HIGH` | `URGENT`)
* **Response Body** (`200 OK` - `Paginated<TaskSummary>`):
```json
{
  "items": [
    {
      "id": "660000000000000000000300",
      "projectId": "660000000000000000000100",
      "number": 1,
      "key": "ENG-1",
      "title": "Setup CI/CD Pipeline",
      "status": "IN_PROGRESS",
      "priority": "HIGH",
      "commentCount": 3,
      "createdBy": {
        "id": "660000000000000000000001",
        "name": "Jane Doe",
        "email": "jane@example.com",
        "avatarUrl": null
      },
      "assignee": {
        "id": "660000000000000000000002",
        "name": "John Smith",
        "email": "john@example.com",
        "avatarUrl": null
      },
      "createdAt": "2026-09-15T10:00:00.000Z",
      "updatedAt": "2026-09-15T11:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

#### `POST /projects/:projectId/tasks`
* **Auth**: Bearer JWT (Project Member / Org Elevated)
* **Request Body**:
```json
{
  "title": "Setup CI/CD Pipeline",
  "description": "Configure GitHub Actions workflows",
  "priority": "HIGH",
  "status": "TODO",
  "assigneeId": "660000000000000000000002"
}
```
* **Response Body** (`201 Created` - `TaskDetail`):
```json
{
  "id": "660000000000000000000300",
  "projectId": "660000000000000000000100",
  "number": 1,
  "key": "ENG-1",
  "title": "Setup CI/CD Pipeline",
  "description": "Configure GitHub Actions workflows",
  "status": "TODO",
  "priority": "HIGH",
  "commentCount": 0,
  "createdBy": {
    "id": "660000000000000000000001",
    "name": "Jane Doe",
    "email": "jane@example.com"
  },
  "assignee": {
    "id": "660000000000000000000002",
    "name": "John Smith",
    "email": "john@example.com"
  },
  "project": {
    "id": "660000000000000000000100",
    "name": "Internal Platform",
    "key": "ENG"
  },
  "createdAt": "2026-09-15T10:00:00.000Z",
  "updatedAt": "2026-09-15T10:00:00.000Z"
}
```

#### `GET /tasks/:taskId`
* **Auth**: Bearer JWT (Project Member / Org Elevated)
* **Response Body** (`200 OK` - `TaskDetail`)

#### `PATCH /tasks/:taskId`
* **Auth**: Bearer JWT (Task Creator / Project Manager / Org Elevated)
* **Request Body**:
```json
{
  "title": "Updated Task Title",
  "description": "Updated Task Description",
  "priority": "URGENT"
}
```
* **Response Body** (`200 OK` - `TaskDetail`)

#### `PATCH /tasks/:taskId/status`
* **Auth**: Bearer JWT (**Enforces Project Access Check via `ProjectAccessService`**)
* **Request Body**:
```json
{
  "status": "DONE"
}
```
* **Response Body** (`200 OK` - `TaskDetail`)

#### `PATCH /tasks/:taskId/assignee`
* **Auth**: Bearer JWT (Authorized Role or Self-Assignment by Member)
* **Request Body**:
```json
{
  "assigneeId": "660000000000000000000002"
}
```
*(Pass `assigneeId: null` to unassign)*
* **Response Body** (`200 OK` - `TaskDetail`)

#### `GET /tasks/:taskId/activity`
* **Auth**: Bearer JWT (Project Member / Org Elevated)
* **Query Parameters**: `page`, `pageSize`
* **Response Body** (`200 OK` - `Paginated<TaskActivityEntry>`):
```json
{
  "items": [
    {
      "id": "660000000000000000000400",
      "taskId": "660000000000000000000300",
      "actor": {
        "id": "660000000000000000000001",
        "name": "Jane Doe",
        "email": "jane@example.com"
      },
      "type": "TASK_ASSIGNEE_CHANGED",
      "metadata": {
        "from": null,
        "to": {
          "id": "660000000000000000000002",
          "name": "John Smith",
          "email": "john@example.com"
        }
      },
      "createdAt": "2026-09-15T11:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

#### `DELETE /tasks/:taskId`
* **Auth**: Bearer JWT (Project Manager / Org Elevated)
* **Response**: `204 No Content`

---

### 4.5 Comments Endpoints (`/tasks/:taskId/comments`)

#### `GET /tasks/:taskId/comments`
* **Auth**: Bearer JWT (Project Member / Org Elevated)
* **Query Parameters**: `page`, `pageSize`
* **Response Body** (`200 OK` - `Paginated<CommentEntry>`):
```json
{
  "items": [
    {
      "id": "660000000000000000000500",
      "taskId": "660000000000000000000300",
      "content": "Looking into this setup today.",
      "author": {
        "id": "660000000000000000000002",
        "name": "John Smith",
        "email": "john@example.com"
      },
      "createdAt": "2026-09-15T11:30:00.000Z",
      "updatedAt": "2026-09-15T11:30:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

#### `POST /tasks/:taskId/comments`
* **Auth**: Bearer JWT (Project Member / Org Elevated)
* **Request Body**:
```json
{
  "content": "Looking into this setup today."
}
```
* **Response Body** (`201 Created` - `CommentEntry`)

---

## 5. Concurrency & Data Consistency Mechanics

### Atomic Task Key Generation
To resolve the race condition present in `countDocuments({ projectId }) + 1`, sequence allocation is handled via MongoDB atomic operations:

```ts
const sequence = await this.taskSequenceModel.findOneAndUpdate(
  { projectId },
  { $inc: { seq: 1 } },
  { new: true, upsert: true }
);
const number = sequence.seq;
const key = `${project.key}-${number}`;
```

Combined with the MongoDB compound unique index:
```ts
TaskSchema.index({ projectId: 1, number: 1 }, { unique: true });
```
This guarantees strict sequential numbering without duplicate key generation under high concurrency.
