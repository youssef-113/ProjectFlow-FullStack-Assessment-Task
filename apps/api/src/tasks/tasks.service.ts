import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type FilterQuery, Model, Types } from 'mongoose';
import type { Paginated, TaskActivityResponse, TaskDetail, TaskSummary } from '@projectflow/shared';
import { toUserSummary } from '../common/utils/serialize';
import { Comment, type CommentDocument } from '../comments/schemas/comment.schema';
import { canManage, ProjectAccessService } from '../projects/project-access.service';
import { Project, type ProjectDocument } from '../projects/schemas/project.schema';
import { ProjectMembersService } from '../project-members/project-members.service';
import { UsersService } from '../users/users.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { ListActivityQueryDto } from './dto/list-activity.dto';
import type { ListTasksQueryDto } from './dto/list-tasks.dto';
import type { UpdateTaskAssigneeDto } from './dto/update-task-assignee.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';
import type { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import {
  TaskActivity,
  type TaskActivityDocument,
  TaskActivityType,
} from './schemas/task-activity.schema';
import { Task, type TaskDocument } from './schemas/task.schema';
import { TaskSequence, type TaskSequenceDocument } from './schemas/task-sequence.schema';


@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name) private readonly taskModel: Model<TaskDocument>,
    @InjectModel(TaskSequence.name) private readonly taskSequenceModel: Model<TaskSequenceDocument>,
    @InjectModel(TaskActivity.name) private readonly taskActivityModel: Model<TaskActivityDocument>,
    @InjectModel(Project.name) private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(Comment.name) private readonly commentModel: Model<CommentDocument>,
    private readonly projectAccessService: ProjectAccessService,
    private readonly projectMembersService: ProjectMembersService,
    private readonly usersService: UsersService,
  ) {}

  async findByProject(
    projectId: Types.ObjectId,
    userId: Types.ObjectId,
    query: ListTasksQueryDto,
  ): Promise<Paginated<TaskSummary>> {
    await this.projectAccessService.assertCanView(projectId, userId);

    const filter: FilterQuery<TaskDocument> = { projectId };
    if (query.status) {
      filter.status = query.status;
    }
    if (query.priority) {
      filter.priority = query.priority;
    }

    const [tasks, total] = await Promise.all([
      this.taskModel.find(filter).sort({ number: 1 }).skip(query.skip).limit(query.pageSize).exec(),
      this.taskModel.countDocuments(filter),
    ]);

    return {
      items: await this.toSummaries(tasks),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async create(
    projectId: Types.ObjectId,
    userId: Types.ObjectId,
    dto: CreateTaskDto,
  ): Promise<TaskDetail> {
    const { project } = await this.projectAccessService.assertCanView(projectId, userId);

    const number = await this.getNextTaskNumber(projectId);

    const task = await this.taskModel.create({
      projectId,
      number,
      key: `${project.key}-${number}`,
      title: dto.title,
      description: dto.description ?? null,
      status: dto.status,
      priority: dto.priority,
      createdBy: userId,
    });

    return this.toDetail(task, project);
  }

  async findOne(taskId: Types.ObjectId, userId: Types.ObjectId): Promise<TaskDetail> {
    const task = await this.findTaskOrFail(taskId);
    const { project } = await this.projectAccessService.assertCanView(task.projectId, userId);

    return this.toDetail(task, project);
  }

  async update(
    taskId: Types.ObjectId,
    userId: Types.ObjectId,
    dto: UpdateTaskDto,
  ): Promise<TaskDetail> {
    const task = await this.findTaskOrFail(taskId);
    const access = await this.projectAccessService.assertCanView(task.projectId, userId);

    const isCreator = task.createdBy.equals(userId);
    if (!canManage(access) && !isCreator) {
      throw new ForbiddenException('You do not have permission to edit this task');
    }

    if (dto.title !== undefined) {
      task.title = dto.title;
    }
    if (dto.description !== undefined) {
      task.description = dto.description;
    }
    if (dto.status !== undefined) {
      task.status = dto.status;
    }
    if (dto.priority !== undefined) {
      task.priority = dto.priority;
    }

    await task.save();

    return this.toDetail(task, access.project);
  }

  async updateStatus(taskId: Types.ObjectId, userId: Types.ObjectId, dto: UpdateTaskStatusDto): Promise<TaskDetail> {
    const task = await this.findTaskOrFail(taskId);
    const { project } = await this.projectAccessService.assertCanView(task.projectId, userId);

    task.status = dto.status;
    await task.save();

    return this.toDetail(task, project);
  }

  async remove(taskId: Types.ObjectId, userId: Types.ObjectId): Promise<void> {
    const task = await this.findTaskOrFail(taskId);
    await this.projectAccessService.assertCanManage(task.projectId, userId);

    await Promise.all([this.commentModel.deleteMany({ taskId: task._id }), task.deleteOne()]);
  }

  async assignTask(
    taskId: Types.ObjectId,
    actorId: Types.ObjectId,
    dto: UpdateTaskAssigneeDto,
  ): Promise<TaskDetail> {
    const task = await this.findTaskOrFail(taskId);
    const access = await this.projectAccessService.assertCanView(task.projectId, actorId);

    // Capture previous assignee before any mutation.
    const previousAssignee = task.assignee ?? null;

    if (dto.assigneeId === null) {
      // Unassignment: any project member may remove the assignee.
      // Skip if already unassigned — no change, no activity.
      if (previousAssignee === null) {
        return this.toDetail(task, access.project);
      }

      task.assignee = null;
      await task.save();

      await this.taskActivityModel.create({
        taskId: task._id,
        actorId,
        type: TaskActivityType.TASK_ASSIGNEE_CHANGED,
        metadata: { from: previousAssignee.toString(), to: null },
      });

      return this.toDetail(task, access.project);
    }

    const assigneeId = new Types.ObjectId(dto.assigneeId);

    // Regular MEMBERs may only assign themselves.
    if (!canManage(access) && !assigneeId.equals(actorId)) {
      throw new ForbiddenException('Members can only assign tasks to themselves');
    }

    // Verify the assignee is a member of this project.
    const assigneeRole = await this.projectMembersService.findRole(task.projectId, assigneeId);
    if (assigneeRole === null) {
      throw new ForbiddenException('The assignee must be a member of this project');
    }

    // Skip if the assignee is not changing — no mutation, no activity.
    if (previousAssignee !== null && assigneeId.equals(previousAssignee)) {
      return this.toDetail(task, access.project);
    }

    task.assignee = assigneeId;
    await task.save();

    await this.taskActivityModel.create({
      taskId: task._id,
      actorId,
      type: TaskActivityType.TASK_ASSIGNEE_CHANGED,
      metadata: {
        from: previousAssignee ? previousAssignee.toString() : null,
        to: assigneeId.toString(),
      },
    });

    return this.toDetail(task, access.project);
  }

  async findActivity(
    taskId: Types.ObjectId,
    userId: Types.ObjectId,
    query: ListActivityQueryDto,
  ): Promise<TaskActivityResponse> {
    const task = await this.findTaskOrFail(taskId);
    await this.projectAccessService.assertCanView(task.projectId, userId);

    // Build query with optional cursor pagination
    const queryBuilder = this.taskActivityModel.find({ taskId });

    if (query.cursor) {
      const [cursorCreatedAt, cursorId] = query.cursor.split('_');
      queryBuilder.where('createdAt').lt(new Date(cursorCreatedAt));
      if (cursorId) {
        queryBuilder.where('_id').lt(new Types.ObjectId(cursorId));
      }
    }

    const activities = await queryBuilder
      .sort({ createdAt: -1, _id: -1 })
      .limit(query.limit + 1) // Fetch one extra to determine if there are more results
      .exec();

    // Determine if there are more results
    const hasMore = activities.length > query.limit;
    const items = hasMore ? activities.slice(0, query.limit) : activities;

    // Generate next cursor if there are more results
    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      nextCursor = `${lastItem.createdAt.toISOString()}_${lastItem._id.toString()}`;
    }

    // Populate actor information
    const actorIds = items.map((activity) => activity.actorId);
    const users = await this.usersService.findManyByIds(actorIds);
    const usersById = new Map(users.map((user) => [user._id.toString(), user]));

    const activityItems = items.map((activity) => ({
      id: activity._id.toString(),
      type: activity.type,
      actor: {
        id: activity.actorId.toString(),
        name: usersById.get(activity.actorId.toString())?.name ?? 'Unknown user',
      },
      metadata: activity.metadata,
      createdAt: activity.createdAt.toISOString(),
    }));

    return {
      items: activityItems,
      nextCursor,
    };
  }

  async findTaskOrFail(taskId: Types.ObjectId): Promise<TaskDocument> {
    const task = await this.taskModel.findById(taskId).exec();
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private async toSummaries(tasks: TaskDocument[]): Promise<TaskSummary[]> {
    if (tasks.length === 0) {
      return [];
    }

    // Collect all user IDs we need: creators + assignees (deduped).
    const assigneeIds = tasks
      .map((t) => t.assignee)
      .filter((id): id is Types.ObjectId => id != null);

    const allUserIds = [
      ...tasks.map((t) => t.createdBy),
      ...assigneeIds,
    ];

    const [users, commentRows] = await Promise.all([
      this.usersService.findManyByIds(allUserIds),
      this.commentModel
        .aggregate<{
          _id: Types.ObjectId;
          count: number;
        }>([
          { $match: { taskId: { $in: tasks.map((task) => task._id) } } },
          { $group: { _id: '$taskId', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const usersById = new Map(users.map((user) => [user._id.toString(), user]));
    const commentCounts = new Map(commentRows.map((row) => [row._id.toString(), row.count]));

    return tasks.map((task) => ({
      id: task._id.toString(),
      projectId: task.projectId.toString(),
      number: task.number,
      key: task.key,
      title: task.title,
      status: task.status,
      priority: task.priority,
      commentCount: commentCounts.get(task._id.toString()) ?? 0,
      createdBy: toUserSummaryOrDeleted(usersById.get(task.createdBy.toString())),
      assignee: task.assignee ? toUserSummaryOrNull(usersById.get(task.assignee.toString())) : null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    }));
  }

  private async toDetail(task: TaskDocument, project?: ProjectDocument): Promise<TaskDetail> {
    const [summary] = await this.toSummaries([task]);
    const resolvedProject = project ?? (await this.projectModel.findById(task.projectId).exec());

    if (!resolvedProject) {
      throw new NotFoundException('Project not found');
    }

    return {
      ...summary!,
      description: task.description ?? null,
      project: {
        id: resolvedProject._id.toString(),
        name: resolvedProject.name,
        key: resolvedProject.key,
      },
    };
  }

  private async getNextTaskNumber(projectId: Types.ObjectId): Promise<number> {
    const sequence = await this.taskSequenceModel
      .findOneAndUpdate({ projectId }, { $inc: { nextNumber: 1 } }, { new: true })
      .exec();

    if (sequence) {
      return sequence.nextNumber;
    }

    const highestTask = await this.taskModel
      .findOne({ projectId })
      .sort({ number: -1 })
      .select('number')
      .exec();
    const initialNumber = (highestTask?.number ?? 0) + 1;

    try {
      const created = await this.taskSequenceModel.create({
        projectId,
        nextNumber: initialNumber,
      });
      return created.nextNumber;
    } catch {
      const retrySequence = await this.taskSequenceModel
        .findOneAndUpdate({ projectId }, { $inc: { nextNumber: 1 } }, { new: true })
        .exec();
      if (retrySequence) {
        return retrySequence.nextNumber;
      }
      throw new Error('Failed to allocate task sequence number');
    }
  }
}

const DELETED_USER = {
  id: '',
  name: 'Unknown user',
  email: '',
  avatarUrl: null,
};

/** Returns a user summary or a deleted-user sentinel (for createdBy, which is always set). */
function toUserSummaryOrDeleted(user: Parameters<typeof toUserSummary>[0] | undefined) {
  return user ? toUserSummary(user) : DELETED_USER;
}

/** Returns a user summary or null (for assignee, which can legitimately be absent). */
function toUserSummaryOrNull(user: Parameters<typeof toUserSummary>[0] | undefined) {
  return user ? toUserSummary(user) : null;
}
