import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '@projectflow/shared';

export class ListActivityQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = 25;

  @IsOptional()
  cursor?: string;
}
