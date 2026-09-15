# Bug Report: Task Mutation Authorization

## Overview

This report documents the investigation into the reported production issue:

> Some users appear to be able to modify tasks belonging to projects they are not members of.

All three existing task mutation endpoints were audited against the actual source code.
The results are recorded below, distinguishing **confirmed vulnerabilities** from **endpoints already protected**.

---

## Audit Summary

| Endpoint | Authenticated? | Resolves task? | Checks project access? | Verdict |
|---|---|---|---|---|
| `PATCH /tasks/:taskId` | Yes | Yes | Yes — `assertCanView` + creator check | Already protected |
| `DELETE /tasks/:taskId` | Yes | Yes | Yes — `assertCanManage` | Already protected |
| `PATCH /tasks/:taskId/status` | Yes | Yes | **No — none** | **Confirmed vulnerable** |

---

## Bug 1 — Unauthorized Task Status Modification (Confirmed Vulnerability)

### Description

Any authenticated user — including users who belong to a completely different organization — could
change the status of any task by calling `PATCH /tasks/:taskId/status` directly with a valid JWT.
The frontend hides this control from unauthorized users, but the backend performed no authorization
check, making the frontend restriction trivially bypassable via a direct API call.

### Severity

**HIGH — Broken Access Control / Insecure Direct Object Reference (OWASP A01)**

### Affected Code

- `apps/api/src/tasks/tasks.controller.ts` — `updateStatus` handler, lines 70–76 (before fix)
- `apps/api/src/tasks/tasks.service.ts` — `updateStatus` method, lines 117–124 (before fix)

### Root Cause

The `updateStatus` controller handler did **not** extract `@CurrentUser('id')`, so no user
identity was available to authorize the request. The service method accepted only
`(taskId, dto)` — it fetched the task and saved the new status without calling
`ProjectAccessService` at all.

**Vulnerable controller (before fix):**

```ts
@Patch('tasks/:taskId/status')
updateStatus(
  @Param('taskId') taskId: string,
  @Body() dto: UpdateTaskStatusDto,
): Promise<TaskDetail> {
  return this.tasksService.updateStatus(toObjectId(taskId, 'task id'), dto);
  //                                    no userId — authorization impossible
}
```

**Vulnerable service (before fix):**

```ts
async updateStatus(taskId: Types.ObjectId, dto: UpdateTaskStatusDto): Promise<TaskDetail> {
  const task = await this.findTaskOrFail(taskId);
  // no projectAccessService call — any authenticated user proceeds
  task.status = dto.status;
  await task.save();
  return this.toDetail(task);
}
```

### Steps to Reproduce

1. Register **User A** and **User B** (User B has no relationship to User A's project).
2. Authenticate as User A and create a task in Project A. Note the `taskId`.
3. Authenticate as User B.
4. `PATCH /tasks/<taskId>/status` with `Authorization: Bearer <User_B_JWT>` and body `{"status":"DONE"}`.
5. **Observed result (before fix):** HTTP 200 OK — task status changed despite User B having no project access.
6. **Expected result:** HTTP 403 Forbidden — task unchanged.

### Security / Business Impact

- Any authenticated user could change the status of any task in the system.
- Malicious actors could advance or regress any workflow state, disrupting project management across all organizations.
- Frontend access controls were the only restriction — easily bypassed via direct API calls.

### Fix

**Authorization level chosen:** `assertCanView` — consistent with the existing `update` endpoint.
Status updates are a normal task operation for all project members; only project access (not
management permission) is required.

**Controller fix — add `@CurrentUser('id') userId` and pass it to the service:**

```ts
@Patch('tasks/:taskId/status')
updateStatus(
  @Param('taskId') taskId: string,
  @CurrentUser('id') userId: string,
  @Body() dto: UpdateTaskStatusDto,
): Promise<TaskDetail> {
  return this.tasksService.updateStatus(
    toObjectId(taskId, 'task id'),
    toObjectId(userId, 'user id'),
    dto,
  );
}
```

**Service fix — add `userId` parameter and call `assertCanView` before mutating:**

```ts
async updateStatus(
  taskId: Types.ObjectId,
  userId: Types.ObjectId,
  dto: UpdateTaskStatusDto,
): Promise<TaskDetail> {
  const task = await this.findTaskOrFail(taskId);
  const { project } = await this.projectAccessService.assertCanView(task.projectId, userId);
  task.status = dto.status;
  await task.save();
  return this.toDetail(task, project);
}
```

`assertCanView` throws `ForbiddenException` if the user is neither an organization OWNER/ADMIN
nor an explicit project member. The task's own `projectId` determines which project the access
check applies to — the client cannot supply an alternative project ID.

---

## Audited and Already Protected Endpoints

### `PATCH /tasks/:taskId` — update

- Extracts `@CurrentUser('id') userId` in the controller.
- Service calls `assertCanView(task.projectId, userId)` first.
- Secondary check: only project managers / org admins / the task creator may edit task fields.
- **No vulnerability found.**

### `DELETE /tasks/:taskId` — remove

- Extracts `@CurrentUser('id') userId` in the controller.
- Service calls `assertCanManage(task.projectId, userId)` — correctly requires elevated permission for deletion.
- **No vulnerability found.**

---

## Regression Tests Added

File: `apps/api/test/tasks.e2e.spec.ts` — nested `describe('task mutation authorization')`

| Test | Covers |
|---|---|
| Authorized member can update task title | Happy path for `PATCH /tasks/:taskId` |
| Outsider receives 403 on update; task unchanged | Unauthorized `PATCH /tasks/:taskId` |
| Outsider receives 403 on delete; task still exists | Unauthorized `DELETE /tasks/:taskId` |
| Authorized member can change task status | Happy path for `PATCH /tasks/:taskId/status` |
| Outsider receives 403 on status change; status unchanged | **Core regression for confirmed vulnerability** |
| Owner (OWNER org role) can delete a task; task then 404s | Confirms org-level OWNER access still works |

---

## Verification Result

After applying the fix: typecheck, lint, all tests, and build pass.

---

## Bug 2 — Task Number Race Condition (Previously Documented)

This is a separate data integrity issue. The concurrency fix (atomic `taskSequenceModel` counter)
was already implemented before this audit and is covered by the existing concurrent-creation test.
