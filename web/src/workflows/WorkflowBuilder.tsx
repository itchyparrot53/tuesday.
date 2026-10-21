import { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, GitBranch, Plus, Trash2, X } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import type { Condition } from '../../../shared/automations';
import type { FilterOp } from '../../../shared/types';
import type { BoardFull, User } from '../../../shared/types';
import type { WorkflowInput, WorkflowStep, WorkflowTrigger } from '../../../shared/workflows';
import { describeWorkflowStep } from '../../../shared/workflows';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Menu, MenuItem } from '../components/ui/Menu';
import {
  ConditionValue,
  ValueField,
  conditionOps,
  defaultConditionValue,
} from '../board/automations/AutomationBuilder';

const TRIGGER_LABELS: Record<WorkflowTrigger['type'], string> = {
  item_created: 'an item is created',
  status_changed: 'a status changes',
  column_changed: 'a column changes',
  person_assigned: 'a person is assigned',
  item_moved_to_group: 'an item moves to a group',
  update_posted: 'an update is posted',
};

const STEP_LABELS: Record<WorkflowStep['type'], string> = {
  create_item: 'Create an item on another board',
  copy_value: 'Copy a value from the source item',
  assign_from: 'Assign the person from a source column',
  set_value: 'Set a value on the current item',
  move_to_group: 'Move the current item to a group',
  post_update: 'Post an update on the current item',
  notify: 'Notify someone',
};

const OP_LABELS: Record<FilterOp, string> = {
  is: 'is',
  is_not: 'is not',
  contains: 'contains',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  gt: 'is greater than',
  lt: 'is less than',
};

function defaultTrigger(
  type: WorkflowTrigger['type'],
  full: BoardFull | undefined,
): WorkflowTrigger {
  const status = full?.columns.find((column) => column.type === 'status');
  const people = full?.columns.find((column) => column.type === 'people');
  switch (type) {
    case 'item_created':
      return { type };
    case 'status_changed':
      return { type, columnId: status?.id ?? 0, toLabelId: null };
    case 'column_changed':
      return { type, columnId: full?.columns[0]?.id ?? 0 };
    case 'person_assigned':
      return { type, columnId: people?.id ?? 0 };
    case 'item_moved_to_group':
      return { type, groupId: full?.groups[0]?.id ?? 0 };
    case 'update_posted':
      return { type };
  }
}

function makeStep(
  type: WorkflowStep['type'],
  source: BoardFull | undefined,
  target: BoardFull | undefined,
  sourceBoardId: number,
): WorkflowStep {
  const sourcePeople = source?.columns.filter((column) => column.type === 'people') ?? [];
  const targetPeople = target?.columns.filter((column) => column.type === 'people') ?? [];
  const sourceColumn = source?.columns[0]?.id ?? 0;
  const targetColumn = target?.columns[0]?.id ?? 0;
  switch (type) {
    case 'create_item':
      return {
        type,
        boardId: target?.board.id ?? sourceBoardId,
        groupId: target?.groups[0]?.id,
        name: 'New item from {{name}}',
      };
    case 'copy_value':
      return { type, sourceColumnId: sourceColumn, targetColumnId: targetColumn };
    case 'assign_from':
      return {
        type,
        sourceColumnId: sourcePeople[0]?.id ?? 0,
        targetColumnId: targetPeople[0]?.id ?? 0,
      };
    case 'set_value':
      return { type, columnId: targetColumn, value: null };
    case 'move_to_group':
      return { type, groupId: target?.groups[0]?.id ?? 0 };
    case 'post_update':
      return { type, body: '{{name}} moved forward in the workflow.' };
    case 'notify':
      return { type, to: 'creator', message: '{{name}} moved forward in the workflow.' };
  }
}

function StepCard({
  step,
  index,
  source,
  target,
  boards,
  users,
  onChange,
  onRemove,
  onMove,
}: {
  step: WorkflowStep;
  index: number;
  source: BoardFull | undefined;
  target: BoardFull | undefined;
  boards: { id: number; name: string }[];
  users: User[];
  onChange: (step: WorkflowStep) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const sourcePeople = source?.columns.filter((column) => column.type === 'people') ?? [];
  const targetPeople = target?.columns.filter((column) => column.type === 'people') ?? [];
  return (
    <div className="rounded-control border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-1.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft t-meta font-semibold text-accent-soft-ink">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <Select
            ariaLabel="Step type"
            value={step.type}
            options={Object.entries(STEP_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={(value) =>
              onChange(
                makeStep(value as WorkflowStep['type'], source, target, source?.board.id ?? 0),
              )
            }
          />
        </div>
        <button
          aria-label="Move step up"
          disabled={index === 0}
          className="rounded-control p-1 text-muted hover:bg-sunken hover:text-ink disabled:opacity-30"
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={12} />
        </button>
        <button
          aria-label="Move step down"
          className="rounded-control p-1 text-muted hover:bg-sunken hover:text-ink"
          onClick={() => onMove(1)}
        >
          <ArrowDown size={12} />
        </button>
        <button
          aria-label="Remove step"
          className="rounded-control p-1 text-muted hover:bg-sunken hover:text-danger"
          onClick={onRemove}
        >
          <Trash2 size={12} />
        </button>
      </div>
      <div className="mt-2 pl-7">
        {step.type === 'create_item' && (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                ariaLabel="Target board"
                value={String(step.boardId)}
                options={boards.map((board) => ({ value: String(board.id), label: board.name }))}
                onChange={(value) => {
                  const nextBoardId = Number(value);
                  onChange({ ...step, boardId: nextBoardId, groupId: undefined });
                }}
              />
              <Select
                ariaLabel="Target group"
                value={String(step.groupId ?? target?.groups[0]?.id ?? '')}
                options={(target?.groups ?? []).map((group) => ({
                  value: String(group.id),
                  label: group.title,
                }))}
                onChange={(value) => onChange({ ...step, groupId: Number(value) })}
              />
            </div>
            <Input
              aria-label="New item name"
              value={step.name}
              onChange={(event) => onChange({ ...step, name: event.target.value })}
            />
          </div>
        )}
        {step.type === 'copy_value' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              ariaLabel="Source column"
              value={String(step.sourceColumnId)}
              options={(source?.columns ?? []).map((column) => ({
                value: String(column.id),
                label: `From: ${column.title}`,
              }))}
              onChange={(value) => onChange({ ...step, sourceColumnId: Number(value) })}
            />
            <Select
              ariaLabel="Target column"
              value={String(step.targetColumnId)}
              options={(target?.columns ?? []).map((column) => ({
                value: String(column.id),
                label: `To: ${column.title}`,
              }))}
              onChange={(value) => onChange({ ...step, targetColumnId: Number(value) })}
            />
          </div>
        )}
        {step.type === 'assign_from' && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              ariaLabel="Source people column"
              value={String(step.sourceColumnId)}
              options={sourcePeople.map((column) => ({
                value: String(column.id),
                label: `From: ${column.title}`,
              }))}
              onChange={(value) => onChange({ ...step, sourceColumnId: Number(value) })}
            />
            <Select
              ariaLabel="Target people column"
              value={String(step.targetColumnId)}
              options={targetPeople.map((column) => ({
                value: String(column.id),
                label: `To: ${column.title}`,
              }))}
              onChange={(value) => onChange({ ...step, targetColumnId: Number(value) })}
            />
          </div>
        )}
        {step.type === 'set_value' && (
          <div className="space-y-2">
            <Select
              ariaLabel="Column to set"
              value={String(step.columnId)}
              options={(target?.columns ?? []).map((column) => ({
                value: String(column.id),
                label: column.title,
              }))}
              onChange={(value) => onChange({ ...step, columnId: Number(value) })}
            />
            <ValueField
              column={target?.columns.find((column) => column.id === step.columnId)}
              value={step.value}
              users={users}
              onChange={(value) => onChange({ ...step, value })}
            />
          </div>
        )}
        {step.type === 'move_to_group' && (
          <Select
            ariaLabel="Target group"
            value={String(step.groupId)}
            options={(target?.groups ?? []).map((group) => ({
              value: String(group.id),
              label: group.title,
            }))}
            onChange={(value) => onChange({ ...step, groupId: Number(value) })}
          />
        )}
        {step.type === 'post_update' && (
          <div className="space-y-2">
            <Select
              ariaLabel="Mention people from column"
              value={step.mentionFromColumnId ? String(step.mentionFromColumnId) : 'none'}
              options={[
                { value: 'none', label: 'Do not tag anyone' },
                ...sourcePeople.map((column) => ({
                  value: String(column.id),
                  label: `Tag the people in ${column.title}`,
                })),
              ]}
              onChange={(value) =>
                onChange({
                  ...step,
                  mentionFromColumnId: value === 'none' ? undefined : Number(value),
                })
              }
            />
            <Textarea
              aria-label="Update body"
              rows={3}
              value={step.body}
              onChange={(event) => onChange({ ...step, body: event.target.value })}
            />
          </div>
        )}
        {step.type === 'notify' && (
          <div className="space-y-2">
            <Select
              ariaLabel="Notify who"
              value={typeof step.to === 'string' ? step.to : 'creator'}
              options={[
                { value: 'creator', label: 'The workflow owner' },
                { value: 'actor', label: 'The person who triggered it' },
                { value: 'assignees', label: 'Everyone assigned on the source item' },
              ]}
              onChange={(value) =>
                onChange({ ...step, to: value as 'creator' | 'actor' | 'assignees' })
              }
            />
            <Input
              aria-label="Notification message"
              value={step.message}
              onChange={(event) => onChange({ ...step, message: event.target.value })}
            />
          </div>
        )}
        <p className="mt-2 t-meta text-muted">
          {describeWorkflowStep(step, {
            columns: target?.columns ?? source?.columns ?? [],
            groups: target?.groups ?? source?.groups ?? [],
            boards,
          })}
        </p>
      </div>
    </div>
  );
}

export function WorkflowBuilder({
  initial,
  workflowId,
  boards,
  users,
  onCancel,
  onSave,
}: {
  initial: WorkflowInput;
  workflowId?: number;
  boards: { id: number; name: string }[];
  users: User[];
  onCancel: () => void;
  onSave: (input: WorkflowInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [triggerBoardId, setTriggerBoardId] = useState(initial.triggerBoardId);
  const [trigger, setTrigger] = useState<WorkflowTrigger>(initial.trigger);
  const [conditions, setConditions] = useState<Condition[]>(initial.conditions);
  const [steps, setSteps] = useState<WorkflowStep[]>(initial.steps);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const boardIds = useMemo(
    () => [
      ...new Set([
        triggerBoardId,
        ...steps.filter((step) => step.type === 'create_item').map((step) => step.boardId),
      ]),
    ],
    [steps, triggerBoardId],
  );
  const boardQueries = useQueries({
    queries: boardIds.map((id) => ({
      queryKey: ['board', id],
      queryFn: () => api<BoardFull>('GET', `/boards/${id}`),
      enabled: id > 0,
    })),
  });
  const fullById = new Map(boardIds.map((id, index) => [id, boardQueries[index]?.data]));
  const source = fullById.get(triggerBoardId);

  function currentBoardIdForStep(index: number): number {
    let current = triggerBoardId;
    for (let i = 0; i < index; i++) {
      const step = steps[i];
      if (step.type === 'create_item') current = step.boardId;
    }
    return current;
  }

  function changeTriggerBoard(id: number) {
    setTriggerBoardId(id);
    const next = boardQueries[boardIds.indexOf(id)]?.data;
    setTrigger(defaultTrigger('item_created', next));
    setConditions([]);
  }

  function addStep(type: WorkflowStep['type']) {
    const targetId = currentBoardIdForStep(steps.length);
    setSteps((current) => [
      ...current,
      makeStep(type, source, fullById.get(targetId), triggerBoardId),
    ]);
  }

  async function save() {
    if (!name.trim()) {
      setError('Give the workflow a name.');
      return;
    }
    if (!steps.length) {
      setError('Add at least one step.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        description: description.trim(),
        enabled,
        triggerBoardId,
        trigger,
        conditions,
        steps,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  if (!source) {
    return (
      <div className="flex min-h-[320px] items-center justify-center px-4 text-sm text-muted">
        Loading boards…
      </div>
    );
  }

  const statusColumns = source.columns.filter((column) => column.type === 'status');
  const peopleColumns = source.columns.filter((column) => column.type === 'people');
  const stepTargetId = currentBoardIdForStep(steps.length);

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur">
        <button
          aria-label="Back to workflows"
          onClick={onCancel}
          className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="t-label text-ink">{workflowId ? 'Edit workflow' : 'New workflow'}</p>
          <p className="t-meta text-muted">Connect boards without copying work by hand.</p>
        </div>
        <button
          type="button"
          aria-pressed={enabled}
          aria-label={enabled ? 'Pause workflow' : 'Resume workflow'}
          onClick={() => setEnabled((value) => !value)}
          className={cn(
            'rounded-chip px-2 py-1 t-meta font-semibold',
            enabled ? 'bg-success-soft text-success' : 'bg-sunken text-muted',
          )}
        >
          {enabled ? 'Active' : 'Paused'}
        </button>
      </div>

      <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 py-5 sm:px-6">
        <div>
          <label htmlFor="workflow-name" className="mb-1 block t-label text-ink">
            Name
          </label>
          <Input
            id="workflow-name"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="workflow-description" className="mb-1 block t-label text-ink">
            What is it for?
          </label>
          <Input
            id="workflow-description"
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Optional — helps the next admin understand it."
          />
        </div>

        <section className="rounded-sheet border border-line bg-surface p-3 sm:p-4">
          <div className="mb-3 flex items-start gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-accent-soft-ink">
              <GitBranch size={12} />
            </span>
            <div>
              <h3 className="t-label text-ink">1. Start on a board</h3>
              <p className="mt-0.5 text-xs text-muted">
                Pick the board whose event starts the workflow.
              </p>
            </div>
          </div>
          <Select
            ariaLabel="Source board"
            value={String(triggerBoardId)}
            options={boards.map((board) => ({ value: String(board.id), label: board.name }))}
            onChange={(value) => changeTriggerBoard(Number(value))}
          />
          <div className="mt-2">
            <Select
              ariaLabel="When"
              value={trigger.type}
              options={Object.entries(TRIGGER_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(value) =>
                setTrigger(defaultTrigger(value as WorkflowTrigger['type'], source))
              }
            />
          </div>
          {trigger.type === 'status_changed' && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Select
                ariaLabel="Status column"
                value={String(trigger.columnId)}
                options={statusColumns.map((column) => ({
                  value: String(column.id),
                  label: column.title,
                }))}
                onChange={(value) =>
                  setTrigger({ ...trigger, columnId: Number(value), toLabelId: null })
                }
              />
              <Select
                ariaLabel="Status value"
                value={trigger.toLabelId ?? 'any'}
                options={[
                  { value: 'any', label: 'Any status' },
                  ...(statusColumns
                    .find((column) => column.id === trigger.columnId)
                    ?.settings.labels?.map((label) => ({ value: label.id, label: label.name })) ??
                    []),
                ]}
                onChange={(value) =>
                  setTrigger({ ...trigger, toLabelId: value === 'any' ? null : value })
                }
              />
            </div>
          )}
          {trigger.type === 'column_changed' && (
            <div className="mt-2">
              <Select
                ariaLabel="Column"
                value={String(trigger.columnId)}
                options={source.columns.map((column) => ({
                  value: String(column.id),
                  label: column.title,
                }))}
                onChange={(value) => setTrigger({ ...trigger, columnId: Number(value) })}
              />
            </div>
          )}
          {trigger.type === 'person_assigned' && (
            <div className="mt-2">
              <Select
                ariaLabel="People column"
                value={String(trigger.columnId)}
                options={peopleColumns.map((column) => ({
                  value: String(column.id),
                  label: column.title,
                }))}
                onChange={(value) => setTrigger({ ...trigger, columnId: Number(value) })}
              />
            </div>
          )}
          {trigger.type === 'item_moved_to_group' && (
            <div className="mt-2">
              <Select
                ariaLabel="Group"
                value={String(trigger.groupId)}
                options={source.groups.map((group) => ({
                  value: String(group.id),
                  label: group.title,
                }))}
                onChange={(value) => setTrigger({ ...trigger, groupId: Number(value) })}
              />
            </div>
          )}
        </section>

        <details className="rounded-sheet border border-line bg-surface p-3 sm:p-4">
          <summary className="cursor-pointer t-label text-ink">
            Only run when… <span className="t-meta text-muted">(optional)</span>
          </summary>
          <div className="mt-3 space-y-2">
            {conditions.map((condition, index) => {
              const column = source.columns.find((entry) => entry.id === condition.columnId);
              return (
                <div
                  key={index}
                  className="grid gap-2 rounded-control border border-line bg-surface-2 p-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
                >
                  <Select
                    ariaLabel="Condition column"
                    value={String(condition.columnId)}
                    options={source.columns.map((entry) => ({
                      value: String(entry.id),
                      label: entry.title,
                    }))}
                    onChange={(value) => {
                      const nextColumn = source.columns.find((entry) => entry.id === Number(value));
                      setConditions((current) =>
                        current.map((entry, i) =>
                          i === index
                            ? {
                                ...entry,
                                columnId: Number(value),
                                op: conditionOps(nextColumn)[0],
                                value: defaultConditionValue(nextColumn, users),
                              }
                            : entry,
                        ),
                      );
                    }}
                  />
                  <Select
                    ariaLabel="Condition operator"
                    value={condition.op}
                    options={conditionOps(column).map((op) => ({
                      value: op,
                      label: OP_LABELS[op],
                    }))}
                    onChange={(value) =>
                      setConditions((current) =>
                        current.map((entry, i) =>
                          i === index ? { ...entry, op: value as FilterOp } : entry,
                        ),
                      )
                    }
                  />
                  {condition.op === 'is_empty' || condition.op === 'is_not_empty' ? (
                    <span className="t-meta text-muted">No value needed</span>
                  ) : (
                    <ConditionValue
                      column={column}
                      value={condition.value}
                      users={users}
                      onChange={(value) =>
                        setConditions((current) =>
                          current.map((entry, i) => (i === index ? { ...entry, value } : entry)),
                        )
                      }
                    />
                  )}
                  <button
                    aria-label="Remove condition"
                    className="rounded-control p-1 text-muted hover:bg-sunken hover:text-danger"
                    onClick={() =>
                      setConditions((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus size={12} />}
              onClick={() =>
                setConditions((current) => [
                  ...current,
                  {
                    columnId: source.columns[0]?.id ?? 0,
                    op: 'is',
                    value: defaultConditionValue(source.columns[0], users),
                  },
                ])
              }
            >
              Add condition
            </Button>
          </div>
        </details>

        <section className="rounded-sheet border border-line bg-surface p-3 sm:p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-accent-soft-ink">
                2
              </span>
              <div>
                <h3 className="t-label text-ink">Then do this</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Steps run in order. A new item becomes the target for later steps.
                </p>
              </div>
            </div>
            <Menu
              align="end"
              trigger={
                <Button size="sm" variant="secondary" icon={<Plus size={12} />}>
                  Add step
                </Button>
              }
            >
              {(Object.keys(STEP_LABELS) as WorkflowStep['type'][]).map((type) => (
                <MenuItem key={type} onSelect={() => addStep(type)}>
                  {STEP_LABELS[type]}
                </MenuItem>
              ))}
            </Menu>
          </div>
          {steps.length === 0 ? (
            <div className="rounded-control border border-dashed border-line-strong/40 px-3 py-6 text-center">
              <p className="t-label text-ink">No steps yet</p>
              <p className="mt-1 text-sm text-muted">
                Add a step to create an item on another board or notify someone.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {steps.map((step, index) => {
                const targetId = currentBoardIdForStep(index);
                const stepTarget = fullById.get(
                  step.type === 'create_item' ? step.boardId : targetId,
                );
                return (
                  <StepCard
                    key={index}
                    step={step}
                    index={index}
                    source={source}
                    target={stepTarget}
                    boards={boards}
                    users={users}
                    onChange={(next) =>
                      setSteps((current) => current.map((entry, i) => (i === index ? next : entry)))
                    }
                    onRemove={() => setSteps((current) => current.filter((_, i) => i !== index))}
                    onMove={(direction) =>
                      setSteps((current) => {
                        const next = [...current];
                        const target = index + direction;
                        if (target < 0 || target >= next.length) return current;
                        [next[index], next[target]] = [next[target], next[index]];
                        return next;
                      })
                    }
                  />
                );
              })}
            </div>
          )}
          <p className="mt-2 t-meta text-muted">
            Next step target: {fullById.get(stepTargetId)?.board.name ?? 'select a board'}
          </p>
        </section>

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-line bg-surface px-4 py-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button loading={saving} disabled={!name.trim() || steps.length === 0} onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
