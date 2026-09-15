'use client';

import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import type { Paginated, TaskDetail, TaskStatus, TaskSummary } from '@projectflow/shared';
import { queryKeys } from '@/lib/query-keys';
import {
  createTask,
  type CreateTaskPayload,
  fetchProjectTasks,
  fetchTask,
  updateTaskStatus,
} from './api';
import { updateTaskAssignee } from './api';
import { fetchTaskActivity } from './api';

export function useProjectTasks(projectId: string) {
  return useQuery<Paginated<TaskSummary>>({
    queryKey: queryKeys.projectTasks(projectId),
    queryFn: () => fetchProjectTasks(projectId),
    enabled: projectId.length > 0,
  });
}

export function useTask(taskId: string) {
  return useQuery<TaskDetail>({
    queryKey: queryKeys.task(taskId),
    queryFn: () => fetchTask(taskId),
    enabled: taskId.length > 0,
  });
}

export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<TaskDetail, Error, CreateTaskPayload>({
    mutationFn: (payload) => createTask(projectId, payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
      ]);
    },
  });
}

export function useUpdateTaskStatus(taskId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<TaskDetail, Error, TaskStatus>({
    mutationFn: (status) => updateTaskStatus(taskId, status),
    onSuccess: async (task) => {
      queryClient.setQueryData(queryKeys.task(taskId), task);
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
    },
  });
}

export function useUpdateTaskAssignee(taskId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<TaskDetail, Error, string | null>({
    mutationFn: (assigneeId) => updateTaskAssignee(taskId, assigneeId ?? null),
    onSuccess: async (task) => {
      queryClient.setQueryData(queryKeys.task(taskId), task);
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasks(projectId) });
    },
  });
}

export function useTaskActivity(taskId: string) {
  return useInfiniteQuery<import('@projectflow/shared').TaskActivityResponse, Error>(
    queryKeys.taskActivity(taskId),
    ({ pageParam }) => fetchTaskActivity(taskId, pageParam),
    {
      enabled: taskId.length > 0,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    },
  );
}
