import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  ArrowRight,
  GitBranch,
  MoreHorizontal,
  PlayCircle,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { Workflow, WorkflowInput, WorkflowRun } from '../../../shared/workflows';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { relative } from '../lib/format';
import { useMe } from '../hooks/useMe';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useUsers } from '../hooks/useUsers';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Dialog, Drawer } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu';
import { QueryError } from '../components/ui/QueryError';
import { Skeleton } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import { WorkflowBuilder } from '../workflows/WorkflowBuilder';

const STEP_LABELS: Record<Workflow['steps'][number]['type'], string> = {
  create_item: 'Create item',
  copy_value: 'Copy value',
  assign_from: 'Assign person',
  set_value: 'Set value',
  move_to_group: 'Move group',
  post_update: 'Post update',
  notify: 'Notify',
};

const TRIGGER_LABELS: Record<Workflow['trigger']['type'], string> = {
  item_created: 'an item is created',
  status_changed: 'a status changes',
  column_changed: 'a column changes',
  person_assigned: 'a person is assigned',
  item_moved_to_group: 'an item moves to a group',
  update_posted: 'an update is posted',
};

function WorkflowRunsDialog({
  workflow,
  onClose,
}: {
  workflow: Workflow | null;
  onClose: () => void;
}) {
  const runs = useQuery({
    queryKey: ['workflow-runs', workflow?.id],
    queryFn: async () =>
      (await api<{ runs: WorkflowRun[] }>('GET', `/workflows/${workflow!.id}/runs`)).runs,
    enabled: Boolean(workflow),
  });
  const targetBoard =
    [...(workflow?.steps ?? [])].reverse().find((step) => step.type === 'create_item')?.boardId ??
    workflow?.triggerBoardId;
  return (
    <Dialog
      open={Boolean(workflow)}
      onOpenChange={(open) => !open && onClose()}
      title={`${workflow?.name ?? 'Workflow'} — run log`}
      description="Every run, including skipped and failed steps."
      size="wide"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {runs.isLoading && <Spinner size={16} />}
      {runs.isError && <QueryError onRetry={() => void runs.refetch()} />}
      {runs.data?.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">
          No runs yet. This workflow starts when its trigger fires.
        </p>
      )}
      {Boolean(runs.data?.length) && (
        <div className="overflow-hidden rounded-control border border-line">
          <div className="grid grid-cols-[90px_minmax(0,1fr)_100px] gap-2 border-b border-line bg-surface-2 px-2 py-1.5 t-label text-muted">
            <span>Status</span>
            <span>Detail</span>
            <span className="text-right">When</span>
          </div>
          {runs.data?.map((run) => (
            <div
              key={run.id}
              className="grid grid-cols-[90px_minmax(0,1fr)_100px] items-start gap-2 border-b border-line px-2 py-2 last:border-b-0"
            >
              <span
                className={cn(
                  'inline-flex w-fit rounded-chip px-1.5 py-0.5 t-meta font-semibold',
                  run.status === 'success'
                    ? 'bg-success-soft text-success'
                    : run.status === 'failed'
                      ? 'bg-danger-soft text-danger-text'
                      : 'bg-sunken text-muted',
                )}
              >
                {run.status}
              </span>
              <span className="min-w-0 truncate text-sm text-muted">
                {run.error ??
                  (run.createdItemId && targetBoard ? (
                    <Link
                      to={`/boards/${targetBoard}?item=${run.createdItemId}`}
                      className="text-accent hover:underline"
                    >
                      Created item #{run.createdItemId}
                    </Link>
                  ) : (
                    'Completed'
                  ))}
              </span>
              <span className="text-right t-meta text-muted">{relative(run.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

export function WorkflowsPage() {
  const me = useMe();
  const users = useUsers();
  const workspaces = useWorkspaces();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<{ id?: number; input: WorkflowInput } | null>(null);
  const [runsFor, setRunsFor] = useState<Workflow | null>(null);
  const isAdmin = me.data?.user.role === 'owner' || me.data?.user.role === 'admin';
  const boards = (workspaces.data ?? []).flatMap((workspace) =>
    workspace.boards.map((board) => ({ id: board.id, name: board.name })),
  );
  const boardName = (id: number) => boards.find((board) => board.id === id)?.name ?? 'a board';

  const workflows = useQuery({
    queryKey: ['workflows'],
    queryFn: async () => (await api<{ workflows: Workflow[] }>('GET', '/workflows')).workflows,
    enabled: isAdmin,
  });

  function newWorkflow() {
    const board = boards[0];
    if (!board) return;
    setEditing({
      input: {
        name: 'New workflow',
        description: '',
        enabled: true,
        triggerBoardId: board.id,
        trigger: { type: 'item_created' },
        conditions: [],
        steps: [],
      },
    });
  }

  async function create(input: WorkflowInput) {
    await api('POST', '/workflows', input);
    await qc.invalidateQueries({ queryKey: ['workflows'] });
    setEditing(null);
    toast.show('Workflow created');
  }

  async function update(input: WorkflowInput) {
    if (!editing?.id) return;
    await api('PATCH', `/workflows/${editing.id}`, input);
    await qc.invalidateQueries({ queryKey: ['workflows'] });
    setEditing(null);
    toast.show('Workflow updated');
  }

  async function toggle(workflow: Workflow) {
    await api('PATCH', `/workflows/${workflow.id}`, { enabled: !workflow.enabled });
    await qc.invalidateQueries({ queryKey: ['workflows'] });
    toast.show(workflow.enabled ? 'Workflow paused' : 'Workflow resumed');
  }

  async function remove(workflow: Workflow) {
    if (!window.confirm(`Delete "${workflow.name}"?`)) return;
    await api('DELETE', `/workflows/${workflow.id}`);
    await qc.invalidateQueries({ queryKey: ['workflows'] });
    toast.show('Workflow deleted');
  }

  async function duplicate(workflow: Workflow) {
    await api('POST', '/workflows', {
      name: `${workflow.name} copy`.slice(0, 120),
      description: workflow.description,
      enabled: false,
      triggerBoardId: workflow.triggerBoardId,
      trigger: workflow.trigger,
      conditions: workflow.conditions,
      steps: workflow.steps,
    });
    await qc.invalidateQueries({ queryKey: ['workflows'] });
    toast.show('Workflow duplicated, paused');
  }

  if (!isAdmin) {
    return (
      <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
        <PageHeader title="Workflows" description="You do not have permission to view workflows." />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
      <PageHeader
        title="Workflows"
        description="Cross-board orchestration: start on one board, then create, copy and assign across others."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw size={14} />}
              onClick={() => void workflows.refetch()}
            >
              Refresh
            </Button>
            <Button icon={<Plus size={14} />} onClick={newWorkflow} disabled={!boards.length}>
              New workflow
            </Button>
          </>
        }
      />

      {!boards.length ? (
        <EmptyState
          icon={<GitBranch size={20} />}
          title="Create a board first"
          description="Workflows need at least one board to start from."
          action={
            <Link to="/">
              <Button variant="secondary">Open Home</Button>
            </Link>
          }
        />
      ) : workflows.isLoading ? (
        <div className="grid gap-2 lg:grid-cols-2">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : workflows.isError ? (
        <QueryError onRetry={() => void workflows.refetch()} />
      ) : !workflows.data?.length ? (
        <div className="rounded-sheet border border-line bg-surface px-6 py-10 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent-soft-ink">
            <GitBranch size={20} />
          </span>
          <h2 className="mt-3 t-section text-ink">No workflows yet</h2>
          <p className="mx-auto mt-1 max-w-[54ch] text-sm leading-6 text-muted">
            A workflow can start in onboarding, create the delivery item in another board, copy the
            account and CSM across, and post the first note — without a person doing it.
          </p>
          <Button className="mt-4" icon={<Plus size={14} />} onClick={newWorkflow}>
            Build your first workflow
          </Button>
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {workflows.data.map((workflow) => (
            <article
              key={workflow.id}
              data-testid="workflow-row"
              className={cn(
                'rounded-pop border border-line bg-surface p-3.5',
                !workflow.enabled && 'bg-surface-2',
              )}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    workflow.enabled
                      ? 'bg-accent-soft text-accent-soft-ink'
                      : 'bg-sunken text-muted',
                  )}
                >
                  <GitBranch size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate t-label text-ink">{workflow.name}</h2>
                      <p className="mt-0.5 t-meta text-muted">
                        When {TRIGGER_LABELS[workflow.trigger.type]} on{' '}
                        {boardName(workflow.triggerBoardId)}
                      </p>
                    </div>
                    <button
                      data-testid="workflow-toggle"
                      aria-label={workflow.enabled ? 'Disable workflow' : 'Enable workflow'}
                      onClick={() => void toggle(workflow)}
                      className={cn(
                        'mt-1 h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors',
                        workflow.enabled ? 'bg-accent' : 'bg-line',
                      )}
                    >
                      <span
                        className={cn(
                          'block h-3 w-3 rounded-full bg-surface transition-transform',
                          workflow.enabled && 'translate-x-3',
                        )}
                      />
                    </button>
                  </div>
                  {workflow.description && (
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted">
                      {workflow.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {workflow.steps.map((step, index) => (
                      <span
                        key={`${step.type}-${index}`}
                        className="rounded-chip bg-sunken px-1.5 py-0.5 t-meta text-muted"
                      >
                        {STEP_LABELS[step.type]}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 t-meta text-muted">
                    <span>{workflow.steps.length} steps</span>
                    <span>·</span>
                    <span>{workflow.runCount} runs</span>
                    {workflow.lastRunAt && <span>· last {relative(workflow.lastRunAt)}</span>}
                  </div>
                </div>
                <Menu
                  trigger={
                    <button
                      aria-label="Workflow actions"
                      className="rounded-control p-1 text-muted hover:bg-sunken hover:text-ink"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                  }
                >
                  <MenuItem onSelect={() => setEditing({ id: workflow.id, input: workflow })}>
                    Edit workflow
                  </MenuItem>
                  <MenuItem onSelect={() => void duplicate(workflow)}>Duplicate</MenuItem>
                  <MenuItem onSelect={() => setRunsFor(workflow)}>
                    <span className="inline-flex items-center gap-2">
                      <PlayCircle size={13} /> View runs
                    </span>
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger onSelect={() => void remove(workflow)}>
                    <span className="inline-flex items-center gap-2">
                      <Trash2 size={13} /> Delete
                    </span>
                  </MenuItem>
                </Menu>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-sheet border border-line bg-surface-2 p-4">
        <div className="flex items-start gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-soft-ink">
            <ArrowRight size={16} />
          </span>
          <div>
            <h2 className="t-label text-ink">Workflows vs automations</h2>
            <p className="mt-1 max-w-[72ch] text-sm leading-6 text-muted">
              Automations live on one board. Workflows are org-level: they start on one board and
              can create or update items on any board the workflow owner can access. Use a workflow
              when data has to cross a handoff; use an automation for a single-board rule.
            </p>
          </div>
        </div>
      </div>

      <WorkflowRunsDialog workflow={runsFor} onClose={() => setRunsFor(null)} />

      <Drawer
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing?.id ? 'Edit workflow' : 'New workflow'}
        closeLabel="Close workflow"
        width="wide"
      >
        {editing && (
          <WorkflowBuilder
            initial={editing.input}
            workflowId={editing.id}
            boards={boards}
            users={users.data?.users ?? []}
            onCancel={() => setEditing(null)}
            onSave={editing.id ? update : create}
          />
        )}
      </Drawer>
    </div>
  );
}
