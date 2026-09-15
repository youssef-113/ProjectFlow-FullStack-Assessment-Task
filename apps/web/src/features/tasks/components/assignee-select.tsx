'use client';

import { useMemo, useState } from 'react';
import { useCurrentUser } from '@/features/auth/hooks';
import { CaretDownIcon } from '@phosphor-icons/react/dist/ssr';
import { Avatar } from '@/components/ui/avatar';
import { ProjectRole } from '@projectflow/shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useProjectMembers } from '@/features/projects/hooks';
import { useUpdateTaskAssignee } from '../hooks';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';

interface AssigneeSelectProps {
  taskId: string;
  projectId: string;
  assignee?: { id: string; name: string; avatarUrl?: string | null } | null;
}

export function AssigneeSelect({ taskId, projectId, assignee }: AssigneeSelectProps) {
  const members = useProjectMembers(projectId);
  const updateAssignee = useUpdateTaskAssignee(taskId, projectId);
  const { data: currentUser } = useCurrentUser();
  const [filter, setFilter] = useState('');

  const items = useMemo(() => {
    if (!members.data) return [];
    return members.data.map((m) => m.user).filter(Boolean) as Array<{
      id: string;
      name: string;
      avatarUrl?: string;
    }>;
  }, [members.data]);

  const filtered = items.filter((u) => u.name.toLowerCase().includes(filter.toLowerCase()));

  // Determine current user's project role (if any)
  const currentMember = (members.data ?? []).find((m) => m.user.id === currentUser?.id);
  const currentRole = currentMember?.role;
  // Only PROJECT_MANAGER is an elevated project-level role.
  // Org OWNER/ADMIN bypass is handled server-side; at the project level the only
  // elevated explicit project role is PROJECT_MANAGER.
  const canAssignOthers = currentRole === ProjectRole.PROJECT_MANAGER;
  const canAssignSelf = !!currentMember;
  const canUnassign = canAssignOthers || (assignee?.id === currentUser?.id);

  const handleSelect = (id: string | null) => {
    if (updateAssignee.isPending) return;
    updateAssignee.mutate(id, {
      onSuccess: () => {
        toast.success('Assignee updated');
      },
      onError: (err) => {
        if (err instanceof ApiError) {
          if (err.statusCode === 403) toast.error('You do not have permission to assign this task.');
          else if (err.statusCode === 404) toast.error('Task or user not found.');
          else toast.error('Failed to update assignee. Please try again.');
        } else {
          toast.error('Failed to update assignee. Please try again.');
        }
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Assignee"
        className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-strong ${
          updateAssignee.isPending ? 'opacity-70 pointer-events-none' : ''
        }`}
      >
        <div className="flex items-center gap-2">
          {assignee ? (
            <>
              <Avatar user={assignee} size="sm" />
              <span className="truncate text-[13px] text-foreground">{assignee.name}</span>
            </>
          ) : (
            <span className="truncate text-[13px] text-muted-foreground">Unassigned</span>
          )}
        </div>
        <CaretDownIcon size={14} className="text-subtle-foreground" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>
          <Input
            placeholder={members.isPending ? 'Loading members...' : 'Search members'}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </DropdownMenuLabel>
        {!canAssignOthers && canAssignSelf ? (
          <div className="px-2 pb-2 text-[12px] text-muted-foreground">You can assign yourself. Contact a project admin to assign others.</div>
        ) : null}
        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => handleSelect(null)} disabled={!canUnassign}>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 shrink-0 rounded-full bg-surface" />
            <span className="text-[13px] text-foreground">Unassigned</span>
          </div>
        </DropdownMenuItem>

        {members.isPending ? (
          <DropdownMenuItem>
            <span className="text-[13px] text-muted-foreground">Loading members…</span>
          </DropdownMenuItem>
        ) : filtered.length === 0 ? (
          <DropdownMenuItem>
            <span className="text-[13px] text-muted-foreground">No members found</span>
          </DropdownMenuItem>
        ) : (
          filtered.map((m) => {
            const disabled = !canAssignOthers && m.id !== currentUser?.id;
            return (
              <DropdownMenuItem key={m.id} onSelect={() => handleSelect(m.id)} disabled={disabled}>
                <div className="flex items-center gap-2">
                  <Avatar user={m} size="sm" />
                  <span className="truncate text-[13px] text-foreground">{m.name}</span>
                </div>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
