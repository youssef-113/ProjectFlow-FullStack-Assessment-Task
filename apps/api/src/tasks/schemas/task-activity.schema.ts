import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export type TaskActivityDocument = HydratedDocument<TaskActivity>;

/** Activity types recorded against a task. */
export enum TaskActivityType {
  TASK_ASSIGNEE_CHANGED = 'TASK_ASSIGNEE_CHANGED',
}

/** Metadata shape for TASK_ASSIGNEE_CHANGED. */
export interface AssigneeChangedMetadata {
  from: string | null;
  to: string | null;
  /** Index signature required for compatibility with Record<string, unknown>. */
  [key: string]: unknown;
}

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'task_activities' })
export class TaskActivity {
  /** The task this activity entry belongs to. */
  @Prop({ type: Types.ObjectId, ref: 'Task', required: true })
  taskId: Types.ObjectId;

  /** The user who triggered this activity. */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId: Types.ObjectId;

  /** Discriminator for the type of activity. */
  @Prop({ type: String, enum: Object.values(TaskActivityType), required: true })
  type: TaskActivityType;

  /**
   * Structured payload describing the change.
   * For TASK_ASSIGNEE_CHANGED: { from: string | null, to: string | null }
   */
  @Prop({ type: Object, required: true })
  metadata: AssigneeChangedMetadata;

  /** Automatically set by Mongoose timestamps. */
  createdAt: Date;
}

export const TaskActivitySchema = SchemaFactory.createForClass(TaskActivity);

/**
 * Primary query pattern: fetch activity for a given task, newest first.
 * Required for the activity timeline API.
 */
TaskActivitySchema.index({ taskId: 1, createdAt: -1 });
