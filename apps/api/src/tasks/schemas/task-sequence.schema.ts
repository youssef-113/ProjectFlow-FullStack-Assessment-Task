import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export type TaskSequenceDocument = HydratedDocument<TaskSequence>;

@Schema({ timestamps: true, collection: 'task_sequences' })
export class TaskSequence {
  @Prop({ type: Types.ObjectId, ref: 'Project', required: true })
  projectId: Types.ObjectId;

  @Prop({ required: true, default: 0, min: 0 })
  nextNumber: number;

  createdAt: Date;
  updatedAt: Date;
}

export const TaskSequenceSchema = SchemaFactory.createForClass(TaskSequence);

TaskSequenceSchema.index({ projectId: 1 }, { unique: true });
