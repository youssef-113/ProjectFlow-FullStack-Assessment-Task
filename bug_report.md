# Bug Report: ProjectFlow Task Security & Concurrency Vulnerabilities

## Overview

This report details the findings from the investigation into reported production issues regarding unauthorized task modifications and data consistency concerns within ProjectFlow.

---

## Bug 1: Unauthorized Task Status Modification (Authorization Bypass)

### Description
Users are able to modify the status of tasks belonging to projects they are not members of, nor authorized to access.

### Severity
**HIGH (Security Vulnerability - Broken Access Control / Insecure Direct Object Reference)**

### Affected Code Locations
* [`apps/api/src/tasks/tasks.controller.ts:70-76`](file:///mnt/F/projects/Fullstack-task/ProjectFlow-FullStack-Assessment-Task/apps/api/src/tasks/tasks.controller.ts#L70-L76)
* [`apps/api/src/tasks/tasks.service.ts:116-123`](file:///mnt/F/projects/Fullstack-task/ProjectFlow-FullStack-Assessment-Task/apps/api/src/tasks/tasks.service.ts#L116-L123)

### Root Cause Analysis
In `TasksController`, the `@Patch('tasks/:taskId/status')` endpoint does not extract the authenticated user's ID via the `@CurrentUser('id')` decorator. Furthermore, `TasksService.updateStatus` fetches the target task by ID and updates its `status` field directly without performing any authorization checks via `ProjectAccessService`.

```ts
// Existing vulnerable code in TasksController:
@Patch('tasks/:taskId/status')
updateStatus(
  @Param('taskId') taskId: string,
  @Body() dto: UpdateTaskStatusDto,
): Promise<TaskDetail> {
  return this.tasksService.updateStatus(toObjectId(taskId, 'task id'), dto);
}

// Existing vulnerable code in TasksService:
async updateStatus(taskId: Types.ObjectId, dto: UpdateTaskStatusDto): Promise<TaskDetail> {
  const task = await this.findTaskOrFail(taskId);

  task.status = dto.status;
  await task.save();

  return this.toDetail(task);
}
```

### Steps to Reproduce
1. Log in as **User A** (who belongs to Project A).
2. Create a task in Project A with `taskId` = `660000000000000000000001`.
3. Log in as **User B** (who is NOT a member of Project A and has no access to Project A).
4. Send a `PATCH /tasks/660000000000000000000001/status` request with header `Authorization: Bearer <User_B_JWT>` and payload `{"status": "DONE"}`.
5. **Observed Result:** HTTP 200 OK. User B successfully modifies the task status in Project A despite having no project permissions.
6. **Expected Result:** HTTP 403 Forbidden.

### Remediation Plan
1. Update `TasksController.updateStatus` to inject `@CurrentUser('id') userId: string`.
2. Update `TasksService.updateStatus` to call `await this.projectAccessService.assertCanView(task.projectId, userId)` before allowing status mutation.
3. Add automated E2E test coverage verifying that non-project members receive HTTP 403 when attempting to update task status.

---

## Bug 2: Task Number Race Condition During Concurrent Task Creation

### Description
When multiple tasks are created concurrently for the same project, duplicate task numbers (e.g., two tasks with key `ENG-1`) can be generated.

### Severity
**MEDIUM (Data Integrity Violation)**

### Affected Code Locations
* [`apps/api/src/tasks/tasks.service.ts:61-62`](file:///mnt/F/projects/Fullstack-task/ProjectFlow-FullStack-Assessment-Task/apps/api/src/tasks/tasks.service.ts#L61-L62)

### Root Cause Analysis
`TasksService.create` calculates the task number by counting existing documents in the project and adding 1:

```ts
const taskCount = await this.taskModel.countDocuments({ projectId });
const number = taskCount + 1;
```

Because `countDocuments` and `taskModel.create` are separate, non-atomic database operations, two concurrent creation requests read the same initial count and assign identical numbers and task keys.

### Steps to Reproduce
1. Send two simultaneous `POST /projects/:projectId/tasks` requests with valid task payloads.
2. **Observed Result:** Both requests receive the same task number and key (e.g., both receive `number: 1`, `key: "ENG-1"`).
3. **Expected Result:** Tasks receive unique, strictly sequential numbers (e.g., `ENG-1` and `ENG-2`).

### Remediation Plan
1. Add a unique compound index `{ projectId: 1, number: 1 }` to `TaskSchema` to enforce database-level uniqueness.
2. Implement an atomic counter schema/sequence document (or atomic increment pattern) to safely allocate sequential numbers per project under high concurrency.
3. Add automated E2E/concurrency tests simulating parallel task creation requests.

---

## Summary of Planned Code Changes

| Issue | File | Fix Strategy |
| :--- | :--- | :--- |
| **Unauthorized Status Update** | [`tasks.controller.ts`](file:///mnt/F/projects/Fullstack-task/ProjectFlow-FullStack-Assessment-Task/apps/api/src/tasks/tasks.controller.ts) | Inject `@CurrentUser('id') userId: string` into `updateStatus` method. |
| **Unauthorized Status Update** | [`tasks.service.ts`](file:///mnt/F/projects/Fullstack-task/ProjectFlow-FullStack-Assessment-Task/apps/api/src/tasks/tasks.service.ts) | Enforce `projectAccessService.assertCanView(task.projectId, userId)` in `updateStatus`. |
| **Concurrent Task Numbering** | [`tasks.service.ts`](file:///mnt/F/projects/Fullstack-task/ProjectFlow-FullStack-Assessment-Task/apps/api/src/tasks/tasks.service.ts) / [`task.schema.ts`](file:///mnt/F/projects/Fullstack-task/ProjectFlow-FullStack-Assessment-Task/apps/api/src/tasks/schemas/task.schema.ts) | Introduce atomic sequence mechanism and database compound unique index. |
| **Regression Testing** | [`apps/api/test/tasks.e2e.spec.ts`](file:///mnt/F/projects/Fullstack-task/ProjectFlow-FullStack-Assessment-Task/apps/api/test/tasks.e2e.spec.ts) | Add E2E tests for task status authorization & task number uniqueness. |
