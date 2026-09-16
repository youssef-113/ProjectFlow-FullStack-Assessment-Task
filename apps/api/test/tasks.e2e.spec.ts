/// <reference types="jest" />

import type { INestApplication } from '@nestjs/common';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { OrganizationRole, ProjectRole, TaskPriority, TaskStatus } from '@projectflow/shared';
import { createTestApp, resetDatabase } from './utils/test-app';
import {
  addOrganizationMember,
  addProjectMember,
  authHeader,
  createOrganization,
  createProject,
  createTask,
  registerUser,
  type TestUser,
} from './utils/fixtures';

describe('Tasks', () => {
  let app: INestApplication;
  let connection: Connection;

  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let projectId: string;

  beforeAll(async () => {
    ({ app, connection } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(connection);

    owner = await registerUser(app, 'Ammar Yaser', 'ammar@example.com');
    member = await registerUser(app, 'Magd Ali', 'magd@example.com');
    outsider = await registerUser(app, 'Outside User', 'outside@example.com');

    const organizationId = await createOrganization(
      connection,
      'Acme Software',
      'acme-software',
      owner.id,
    );
    await addOrganizationMember(connection, organizationId, owner.id, OrganizationRole.OWNER);
    await addOrganizationMember(connection, organizationId, member.id, OrganizationRole.MEMBER);

    projectId = await createProject(
      connection,
      organizationId,
      'Internal Platform',
      'ENG',
      owner.id,
    );
    await addProjectMember(connection, projectId, member.id, ProjectRole.MEMBER);
  });

  it('lets a project member create a task', async () => {
    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({
        title: 'Improve API error handling',
        description: 'Normalise validation and permission errors.',
        priority: TaskPriority.HIGH,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      key: 'ENG-1',
      number: 1,
      title: 'Improve API error handling',
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
    });
    expect(response.body.createdBy).toMatchObject({ email: 'magd@example.com' });
  });

  it('numbers tasks sequentially within a project', async () => {
    for (const title of ['First task', 'Second task', 'Third task']) {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', authHeader(member))
        .send({ title })
        .expect(201);
    }

    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .expect(200);

    expect(response.body.total).toBe(3);
    expect(response.body.items.map((task: { key: string }) => task.key)).toEqual([
      'ENG-1',
      'ENG-2',
      'ENG-3',
    ]);
  });

  it('refuses to create a task for someone outside the project', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(outsider))
      .send({ title: 'Should not be created' })
      .expect(403);
  });

  it('refuses to list tasks for someone outside the project', async () => {
    await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(outsider))
      .expect(403);
  });

  it('rejects a task without a usable title', async () => {
    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({ title: 'ab' })
      .expect(400);

    expect(response.body.statusCode).toBe(400);
  });

  it('filters the task list by status', async () => {
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({ title: 'Work in flight', status: TaskStatus.IN_PROGRESS })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/tasks`)
      .set('Authorization', authHeader(member))
      .send({ title: 'Not started yet' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tasks`)
      .query({ status: TaskStatus.IN_PROGRESS })
      .set('Authorization', authHeader(member))
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0]).toMatchObject({ title: 'Work in flight' });
  });

  it('generates unique sequential task numbers under concurrent creation', async () => {
    const creationRequests = Array.from({ length: 5 }, (_, i) =>
      request(app.getHttpServer())
        .post(`/projects/${projectId}/tasks`)
        .set('Authorization', authHeader(member))
        .send({ title: `Concurrent task ${i + 1}` }),
    );

    const responses = await Promise.all(creationRequests);
    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    const numbers = responses.map((res) => res.body.number);
    const keys = responses.map((res) => res.body.key);

    expect(new Set(numbers).size).toBe(5);
    expect(new Set(keys).size).toBe(5);
  });

  // ── Authorization regression tests ─────────────────────────────────────────
  // These tests cover the confirmed vulnerability: PATCH /tasks/:taskId/status
  // did not check project membership, allowing any authenticated user to mutate
  // tasks belonging to projects they should not access.

  describe('task mutation authorization', () => {
    let taskId: string;

    beforeEach(async () => {
      // Create the task as 'member' so that member satisfies the isCreator check
      // in the update endpoint (canManage || isCreator). This tests the normal
      // happy-path where a project member edits a task they created.
      taskId = await createTask(connection, projectId, 'ENG', 1, 'Auth regression task', member.id);
    });

    it('allows a project member to update a task', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}`)
        .set('Authorization', authHeader(member))
        .send({ title: 'Updated title' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(response.body.title).toBe('Updated title');
    });

    it('returns 403 when an outsider attempts to update a task', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}`)
        .set('Authorization', authHeader(outsider))
        .send({ title: 'Hijacked title' })
        .expect(403);

      // Verify the task was not modified.
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(response.body.title).toBe('Auth regression task');
    });

    it('returns 403 when an outsider attempts to delete a task', async () => {
      await request(app.getHttpServer())
        .delete(`/tasks/${taskId}`)
        .set('Authorization', authHeader(outsider))
        .expect(403);

      // Verify the task still exists.
      await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .set('Authorization', authHeader(member))
        .expect(200);
    });

    it('allows a project member to change task status', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .set('Authorization', authHeader(member))
        .send({ status: TaskStatus.IN_PROGRESS })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(response.body.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('returns 403 when an outsider attempts to change task status', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/status`)
        .set('Authorization', authHeader(outsider))
        .send({ status: TaskStatus.DONE })
        .expect(403);

      // Verify status was not changed.
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(response.body.status).toBe(TaskStatus.TODO);
    });

    it('allows the project owner to delete a task', async () => {
      await request(app.getHttpServer())
        .delete(`/tasks/${taskId}`)
        .set('Authorization', authHeader(owner))
        .expect(204);

      // Task should no longer be accessible.
      await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .set('Authorization', authHeader(owner))
        .expect(404);
    });
  });

  // ── Assignment tests ────────────────────────────────────────────────────────

  describe('task assignment', () => {
    let taskId: string;
    let manager: TestUser;

    beforeEach(async () => {
      // Add a PROJECT_MANAGER to the project for elevated-role tests.
      manager = await registerUser(app, 'Project Manager', 'manager@example.com');
      await addOrganizationMember(connection, /* need orgId */ await getOrgId(), manager.id, OrganizationRole.MEMBER);
      await addProjectMember(connection, projectId, manager.id, ProjectRole.PROJECT_MANAGER);

      taskId = await createTask(connection, projectId, 'ENG', 2, 'Assignment test task', owner.id);
    });

    // Helper: retrieve the current organizationId from the project fixture.
    // We store it during setup — easier to just re-derive from the existing connection.
    async function getOrgId(): Promise<string> {
      const project = await connection.collection('projects').findOne({});
      return project!.organizationId.toString();
    }

    // Test 1 — Member assigns self
    it('allows a project member to assign themselves', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(member))
        .send({ assigneeId: member.id })
        .expect(200);

      expect(response.body.assignee).toMatchObject({ email: 'magd@example.com' });
    });

    // Test 2 — Elevated role (PROJECT_MANAGER) assigns another member
    it('allows a project manager to assign another project member', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(manager))
        .send({ assigneeId: member.id })
        .expect(200);

      expect(response.body.assignee).toMatchObject({ email: 'magd@example.com' });
    });

    // Test 2b — OWNER (elevated org role) assigns another member
    it('allows the org owner to assign another project member', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(owner))
        .send({ assigneeId: member.id })
        .expect(200);

      expect(response.body.assignee).toMatchObject({ email: 'magd@example.com' });
    });

    // Test 3 — Regular MEMBER cannot assign another member
    it('prevents a regular member from assigning another member', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(member))
        .send({ assigneeId: manager.id })
        .expect(403);

      // Task assignee must remain null.
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(response.body.assignee).toBeNull();
    });

    // Test 4 — Outside-project user cannot be assigned
    it('rejects assigning a user who is not a project member', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(owner))
        .send({ assigneeId: outsider.id })
        .expect(403);

      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(response.body.assignee).toBeNull();
    });

    // Test 5 — Unassignment
    it('allows unassigning a task', async () => {
      // Assign first.
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(member))
        .send({ assigneeId: member.id })
        .expect(200);

      // Then unassign.
      const response = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(member))
        .send({ assigneeId: null })
        .expect(200);

      expect(response.body.assignee).toBeNull();
    });

    // Test 6 — Unauthorized actor cannot assign
    it('returns 403 when a user outside the project tries to assign', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(outsider))
        .send({ assigneeId: outsider.id })
        .expect(403);

      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}`)
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(response.body.assignee).toBeNull();
    });

    // Test 7 — Same assignee is idempotent
    it('handles re-assigning to the same user without error', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(member))
        .send({ assigneeId: member.id })
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(member))
        .send({ assigneeId: member.id })
        .expect(200);

      expect(response.body.assignee).toMatchObject({ email: 'magd@example.com' });
    });
  });

  // ── Activity recording tests ────────────────────────────────────────────────

  describe('task assignment activity', () => {
    let taskId: string;
    let manager: TestUser;

    /** Query task_activities for a given task and return them newest-first. */
    async function getActivities(forTaskId: string) {
      return connection
        .collection('task_activities')
        .find({ taskId: new (connection.base.Types.ObjectId)(forTaskId) })
        .sort({ createdAt: -1 })
        .toArray();
    }

    beforeEach(async () => {
      manager = await registerUser(app, 'Project Manager', 'manager@example.com');
      const project = await connection.collection('projects').findOne({});
      const orgId = project!.organizationId.toString();
      await addOrganizationMember(connection, orgId, manager.id, OrganizationRole.MEMBER);
      await addProjectMember(connection, projectId, manager.id, ProjectRole.PROJECT_MANAGER);

      taskId = await createTask(connection, projectId, 'ENG', 3, 'Activity test task', owner.id);
    });

    // Test 1 — null → User A creates activity
    it('records activity when assigning a previously unassigned task', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(member))
        .send({ assigneeId: member.id })
        .expect(200);

      const activities = await getActivities(taskId);
      expect(activities).toHaveLength(1);
      expect(activities[0]).toMatchObject({
        type: 'TASK_ASSIGNEE_CHANGED',
        metadata: { from: null, to: member.id },
      });
      expect(activities[0]!.actorId.toString()).toBe(member.id);
    });

    // Test 2 — User A → User B creates activity
    it('records activity when changing assignee from one member to another', async () => {
      // Assign to member first.
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(manager))
        .send({ assigneeId: member.id })
        .expect(200);

      // Reassign to manager.
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(manager))
        .send({ assigneeId: manager.id })
        .expect(200);

      const activities = await getActivities(taskId);
      expect(activities).toHaveLength(2);
      // Newest first.
      expect(activities[0]).toMatchObject({
        type: 'TASK_ASSIGNEE_CHANGED',
        metadata: { from: member.id, to: manager.id },
      });
    });

    // Test 3 — User A → null creates activity
    it('records activity when unassigning a task', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(member))
        .send({ assigneeId: member.id })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(member))
        .send({ assigneeId: null })
        .expect(200);

      const activities = await getActivities(taskId);
      expect(activities).toHaveLength(2);
      expect(activities[0]).toMatchObject({
        type: 'TASK_ASSIGNEE_CHANGED',
        metadata: { from: member.id, to: null },
      });
    });

    // Test 4 — Same assignee creates no activity
    it('does not create activity when the assignee does not change', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(member))
        .send({ assigneeId: member.id })
        .expect(200);

      // Assign to the same user again.
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(member))
        .send({ assigneeId: member.id })
        .expect(200);

      const activities = await getActivities(taskId);
      expect(activities).toHaveLength(1);
    });

    // Test 5 — Unauthorized assignment creates no activity
    it('does not create activity when the assignment is rejected', async () => {
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(outsider))
        .send({ assigneeId: outsider.id })
        .expect(403);

      const activities = await getActivities(taskId);
      expect(activities).toHaveLength(0);
    });
  });

  // ── Activity history API tests ─────────────────────────────────────────────

  describe('task activity history', () => {
    let taskId: string;
    let anotherTaskId: string;

    beforeEach(async () => {
      taskId = await createTask(connection, projectId, 'ENG', 4, 'Activity history task', owner.id);
      anotherTaskId = await createTask(connection, projectId, 'ENG', 5, 'Another task', owner.id);

      // Create some activity on the first task
      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(owner))
        .send({ assigneeId: member.id })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/tasks/${taskId}/assignee`)
        .set('Authorization', authHeader(owner))
        .send({ assigneeId: owner.id })
        .expect(200);

      // Create activity on the second task to ensure isolation
      await request(app.getHttpServer())
        .patch(`/tasks/${anotherTaskId}/assignee`)
        .set('Authorization', authHeader(owner))
        .send({ assigneeId: member.id })
        .expect(200);
    });

    it('allows authorized project member to read task activity', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/activity`)
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.items[0]).toMatchObject({
        type: 'TASK_ASSIGNEE_CHANGED',
        actor: { id: owner.id, name: 'Ammar Yaser' },
      });
      expect(response.body.items[0].metadata).toMatchObject({
        from: member.id,
        to: owner.id,
      });
    });

    it('returns 403 when unauthorized user attempts to read activity', async () => {
      await request(app.getHttpServer())
        .get(`/tasks/${taskId}/activity`)
        .set('Authorization', authHeader(outsider))
        .expect(403);
    });

    it('returns 404 for non-existing task', async () => {
      const fakeTaskId = new connection.base.Types.ObjectId().toString();
      await request(app.getHttpServer())
        .get(`/tasks/${fakeTaskId}/activity`)
        .set('Authorization', authHeader(member))
        .expect(404);
    });

    it('returns activities in newest-first order', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/activity`)
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      // First activity should be the most recent (owner assigned to owner)
      expect(response.body.items[0].metadata.to).toBe(owner.id);
      // Second activity should be the earlier one (null assigned to member)
      expect(response.body.items[1].metadata.from).toBeNull();
    });

    it('returns activities only for the requested task', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/activity`)
        .set('Authorization', authHeader(member))
        .expect(200);

      // Should only return activities for taskId (2 activities created for this task)
      expect(response.body.items).toHaveLength(2);

      // Verify that the other task has different activity count
      const otherResponse = await request(app.getHttpServer())
        .get(`/tasks/${anotherTaskId}/activity`)
        .set('Authorization', authHeader(member))
        .expect(200);

      // The other task should only have 1 activity
      expect(otherResponse.body.items).toHaveLength(1);
    });

    it('includes actor information in response', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/activity`)
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(response.body.items[0].actor).toMatchObject({
        id: owner.id,
        name: 'Ammar Yaser',
      });
    });

    it('supports cursor-based pagination', async () => {
      // Create more activities to test pagination
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .patch(`/tasks/${taskId}/assignee`)
          .set('Authorization', authHeader(owner))
          .send({ assigneeId: i % 2 === 0 ? member.id : owner.id })
          .expect(200);
      }

      // First page with limit 3
      const firstPage = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/activity`)
        .query({ limit: 3 })
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(firstPage.body.items).toHaveLength(3);
      expect(firstPage.body.nextCursor).not.toBeNull();

      // Second page using cursor
      const secondPage = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/activity`)
        .query({ limit: 3, cursor: firstPage.body.nextCursor })
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(secondPage.body.items.length).toBeGreaterThan(0);
      // Ensure we're getting different items
      const firstIds = firstPage.body.items.map((item: { id: string }) => item.id);
      const secondIds = secondPage.body.items.map((item: { id: string }) => item.id);
      const hasOverlap = firstIds.some((id: string) => secondIds.includes(id));
      expect(hasOverlap).toBe(false);
    });

    it('returns null nextCursor when no more results', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/activity`)
        .query({ limit: 100 })
        .set('Authorization', authHeader(member))
        .expect(200);

      // With a high limit, we should get all activities
      expect(response.body.nextCursor).toBeNull();
    });

    it('respects limit parameter', async () => {
      const response = await request(app.getHttpServer())
        .get(`/tasks/${taskId}/activity`)
        .query({ limit: 1 })
        .set('Authorization', authHeader(member))
        .expect(200);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.nextCursor).not.toBeNull();
    });
  });
});
