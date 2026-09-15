'use client';

import { Fragment } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useTaskActivity } from '../hooks';
import { useProjectMembers } from '@/features/projects/hooks';
import { formatDateRelative } from '@/lib/format';

interface ActivityTimelineProps {
  taskId: string;
  projectId: string;
}

export function ActivityTimeline({ taskId, projectId }: ActivityTimelineProps) {
  const activity = useTaskActivity(taskId);
  const members = useProjectMembers(projectId);

  if (activity.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (activity.isError) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-[13px] text-danger">
        Failed to load activity.
      </div>
    );
  }

  const pages = activity.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);

  if (items.length === 0) {
    return (
      <div className="text-[13px] text-muted-foreground">No activity yet. Changes to this task will appear here.</div>
    );
  }

  const membersById = new Map((members.data ?? []).map((m) => [m.user.id, m.user]));

  return (
    <div className="space-y-4">
      {items.map((it) => {
        const actor = { name: it.actor.name };
        const metadata = it.metadata as Record<string, unknown>;
        const fromId = (metadata?.from as string) ?? null;
        const toId = (metadata?.to as string) ?? null;

        const fromName = fromId ? membersById.get(fromId)?.name ?? 'Unknown user' : null;
        const toName = toId ? membersById.get(toId)?.name ?? 'Unknown user' : null;

        let text = 'Activity updated';
        if (it.type === 'TASK_ASSIGNEE_CHANGED') {
          if (!fromId && toId) {
            text = `${it.actor.name} assigned this task to ${toName}`;
          } else if (fromId && toId) {
            text = `${it.actor.name} changed the assignee from ${fromName} to ${toName}`;
          } else if (fromId && !toId) {
            text = `${it.actor.name} unassigned this task from ${fromName}`;
          }
        }

        return (
          <div key={it.id} className="flex gap-3">
            <div className="shrink-0">
              <Avatar user={actor} size="sm" />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] text-foreground">{text}</div>
              <div className="mt-1 text-[12px] text-muted-foreground">{formatDateRelative(it.createdAt)}</div>
            </div>
          </div>
        );
      })}

      {pages[pages.length - 1].nextCursor ? (
        <div>
          <Button
            variant="ghost"
            onClick={() => activity.fetchNextPage()}
            disabled={activity.isFetchingNextPage}
          >
            {activity.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
