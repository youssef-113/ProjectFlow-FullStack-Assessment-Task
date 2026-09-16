import { IsMongoId, IsOptional, ValidateIf } from 'class-validator';

export class UpdateTaskAssigneeDto {
  /**
   * The ID of the user to assign, or null to unassign.
   * When present it must be a valid MongoDB ObjectId.
   */
  @ValidateIf((dto: UpdateTaskAssigneeDto) => dto.assigneeId !== null)
  @IsOptional()
  @IsMongoId()
  assigneeId: string | null;
}
