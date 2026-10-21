import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bell,
  CalendarClock,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { Action, AutomationInput, Condition, Trigger } from '../../../../shared/automations';
import type { BoardFull, Column, User } from '../../../../shared/types';
import type { FilterOp } from '../../../../shared/types';
import { describeAutomation } from '../../../../shared/automations';
import { cn } from '../../lib/cn';
import { Button } from '../../components/ui/Button';
import { Input, Textarea } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Segmented } from '../../components/ui/Tabs';
import { AutomationSentence } from './parts';

const TRIGGER_LABELS: Record<Trigger['type'], string> = {
  item_created: 'an item is created',
  subitem_created: 'a subitem is created',
  status_changed: 'a status changes',
  column_changed: 'a column changes',
  person_assigned: 'a person is assigned',
  item_moved_to_group: 'an item moves to a group',
  update_posted: 'an update is posted',
  date_arrives: 'a date arrives',
  date_passed: 'a date passes',
  recurring: 'on a schedule',
};

const ACTION_LABELS: Record<Action['type'], string> = {
  set_value: 'Set a value',
  move_to_group: 'Move to a group',
  assign: 'Assign someone',
  notify: 'Notify',
  create_item: 'Create an item',
  create_subitem: 'Create a subitem',
  post_update: 'Post an update',
  archive_item: 'Archive the item',
  ai_prompt: 'Ask AI to fill a column',
  send_webhook: 'Send a webhook',
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

const SETTABLE_TYPES = new Set([
  'text',
  'long_text',
  'number',
  'status',
  'dropdown',
  'people',
  'date',
  'timeline',
  'checkbox',
  'link',
  'email',
  'phone',
  'rating',
]);

const CHOICE_TYPES = new Set(['status', 'dropdown', 'people', 'checkbox']);

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function asShape(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function conditionOps(column?: Column): FilterOp[] {
  if (!column) return ['is'];
  if (CHOICE_TYPES.has(column.type)) return ['is', 'is_not', 'is_empty', 'is_not_empty'];
  if (['number', 'rating', 'date', 'timeline'].includes(column.type)) {
    return ['is', 'is_not', 'gt', 'lt', 'is_empty', 'is_not_empty'];
  }
  return ['is', 'is_not', 'contains', 'is_empty', 'is_not_empty'];
}

function defaultValue(column: Column | undefined, users: User[]): unknown {
  if (!column) return null;
  switch (column.type) {
    case 'status':
      return { labelId: column.settings.labels?.[0]?.id ?? '' };
    case 'dropdown':
      return { optionIds: column.settings.options?.[0]?.id ? [column.settings.options[0].id] : [] };
    case 'people':
      return { userIds: users[0] ? [users[0].id] : [] };
    case 'date':
      return { relativeDays: 0 };
    case 'timeline':
      return { from: today(), to: today() };
    case 'checkbox':
      return { checked: true };
    case 'number':
      return { number: 0 };
    case 'rating':
      return { rating: 1 };
    case 'link':
      return { url: 'https://' };
    default:
      return { text: '' };
  }
}

export function defaultConditionValue(
  column: Column | undefined,
  users: User[],
): Condition['value'] {
  if (!column) return '';
  switch (column.type) {
    case 'status':
      return column.settings.labels?.[0]?.id ?? '';
    case 'dropdown':
      return column.settings.options?.[0]?.id ?? '';
    case 'people':
      return users[0]?.id ?? '';
    case 'checkbox':
      return 'yes';
    case 'date':
    case 'timeline':
      return today();
    default:
      return '';
  }
}

function makeTrigger(type: Trigger['type'], full: BoardFull): Trigger {
  const status = full.columns.find((column) => column.type === 'status');
  const people = full.columns.find((column) => column.type === 'people');
  const date = full.columns.find((column) => column.type === 'date' || column.type === 'timeline');
  switch (type) {
    case 'item_created':
      return { type };
    case 'subitem_created':
      return { type };
    case 'status_changed':
      return { type, columnId: status?.id ?? 0, toLabelId: null };
    case 'column_changed':
      return { type, columnId: full.columns[0]?.id ?? 0 };
    case 'person_assigned':
      return { type, columnId: people?.id ?? 0 };
    case 'item_moved_to_group':
      return { type, groupId: full.groups[0]?.id ?? 0 };
    case 'update_posted':
      return { type };
    case 'date_arrives':
      return { type, columnId: date?.id ?? 0, offsetDays: 0, hour: 9 };
    case 'date_passed':
      return { type, columnId: date?.id ?? 0, hour: 9 };
    case 'recurring':
      return { type, every: 'week', weekday: 1, hour: 9 };
  }
}

export function makeAction(type: Action['type'], full: BoardFull, users: User[]): Action {
  const people = full.columns.find((column) => column.type === 'people');
  const settable = full.columns.find((column) => SETTABLE_TYPES.has(column.type));
  const text = full.columns.find((column) => column.type === 'text' || column.type === 'long_text');
  switch (type) {
    case 'set_value':
      return { type, columnId: settable?.id ?? 0, value: defaultValue(settable, users) };
    case 'move_to_group':
      return { type, groupId: full.groups[0]?.id ?? 0 };
    case 'assign':
      return { type, columnId: people?.id ?? 0, who: 'creator' };
    case 'notify':
      return { type, to: 'creator', message: '{{name}} changed' };
    case 'create_item':
      return {
        type,
        boardId: full.board.id,
        groupId: full.groups[0]?.id,
        name: 'New item',
      };
    case 'create_subitem':
      return { type, name: 'New subitem' };
    case 'post_update':
      return { type, body: '{{name}} changed' };
    case 'archive_item':
      return { type };
    case 'ai_prompt':
      return {
        type,
        prompt: 'Summarize {{name}}',
        targetColumnId: text?.id ?? 0,
      };
    case 'send_webhook':
      return { type, url: 'https://example.com/webhook' };
  }
}

function ActionTypeMenu({
  action,
  onChange,
}: {
  action: Action;
  onChange: (action: Action) => void;
}) {
  return (
    <Select
      ariaLabel="Action"
      value={action.type}
      options={Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label }))}
      onChange={(value) => onChange({ ...action, type: value } as Action)}
    />
  );
}

export function ValueField({
  column,
  value,
  users,
  onChange,
}: {
  column?: Column;
  value: unknown;
  users: User[];
  onChange: (value: unknown) => void;
}) {
  const shape = asShape(value);
  if (!column) return <p className="t-meta text-muted">No column selected.</p>;

  if (column.type === 'status') {
    const labels = column.settings.labels ?? [];
    const current =
      (shape.labelId as string | undefined) ??
      (typeof value === 'string' && value ? value : undefined) ??
      labels[0]?.id ??
      '';
    return (
      <Select
        ariaLabel="Status value"
        value={current}
        options={labels.map((label) => ({ value: label.id, label: label.name }))}
        onChange={(labelId) => onChange({ labelId })}
      />
    );
  }
  if (column.type === 'dropdown') {
    const options = column.settings.options ?? [];
    const ids = (shape.optionIds as string[] | undefined) ?? [];
    return (
      <Select
        ariaLabel="Dropdown value"
        value={ids[0] ?? options[0]?.id ?? ''}
        options={options.map((option) => ({ value: option.id, label: option.name }))}
        onChange={(optionId) => onChange({ optionIds: [optionId] })}
      />
    );
  }
  if (column.type === 'people') {
    const ids = (shape.userIds as number[] | undefined) ?? [];
    return (
      <PeopleSelect
        ariaLabel="Person value"
        users={users}
        value={ids[0] ?? null}
        onChange={(userId) => onChange({ userIds: userId ? [userId] : [] })}
      />
    );
  }
  if (column.type === 'checkbox') {
    const checked = shape.checked !== false;
    return (
      <Select
        ariaLabel="Checkbox value"
        value={checked ? 'checked' : 'unchecked'}
        options={[
          { value: 'checked', label: 'Checked' },
          { value: 'unchecked', label: 'Unchecked' },
        ]}
        onChange={(next) => onChange({ checked: next === 'checked' })}
      />
    );
  }
  if (column.type === 'date') {
    const relativeDays = shape.relativeDays;
    const isRelative = typeof relativeDays === 'number';
    const date =
      (shape.date as string | undefined) ?? (typeof value === 'string' ? value : '') ?? today();
    return (
      <div className="space-y-2">
        <Segmented
          label="Date mode"
          value={isRelative ? 'relative' : 'fixed'}
          options={[
            { id: 'relative', label: 'Days from today' },
            { id: 'fixed', label: 'Specific date' },
          ]}
          onChange={(mode) =>
            onChange(mode === 'relative' ? { relativeDays: 0 } : { date: today() })
          }
        />
        {isRelative ? (
          <div className="flex items-center gap-2">
            <Input
              aria-label="Days from today"
              type="number"
              value={Number(relativeDays)}
              onChange={(event) => onChange({ relativeDays: Number(event.target.value) })}
              className="w-24"
            />
            <span className="t-meta text-muted">
              {Number(relativeDays) === 0
                ? 'Today'
                : Number(relativeDays) > 0
                  ? 'days after the run'
                  : 'days before the run'}
            </span>
          </div>
        ) : (
          <Input
            aria-label="Date value"
            type="date"
            value={date}
            onChange={(event) => onChange({ date: event.target.value })}
          />
        )}
      </div>
    );
  }
  if (column.type === 'timeline') {
    const from = (shape.from as string | undefined) ?? today();
    const to = (shape.to as string | undefined) ?? from;
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          aria-label="Timeline start"
          type="date"
          value={from}
          onChange={(event) => onChange({ from: event.target.value, to })}
        />
        <Input
          aria-label="Timeline end"
          type="date"
          value={to}
          onChange={(event) => onChange({ from, to: event.target.value })}
        />
      </div>
    );
  }
  if (column.type === 'number' || column.type === 'rating') {
    const numeric =
      column.type === 'number'
        ? ((shape.number as number | undefined) ?? (typeof value === 'number' ? value : 0))
        : ((shape.rating as number | undefined) ?? (typeof value === 'number' ? value : 1));
    return (
      <Input
        aria-label={column.type === 'number' ? 'Number value' : 'Rating value'}
        type="number"
        min={column.type === 'rating' ? 1 : undefined}
        max={column.type === 'rating' ? (column.settings.max ?? 5) : undefined}
        value={numeric}
        onChange={(event) =>
          onChange(
            column.type === 'number'
              ? { number: Number(event.target.value) }
              : { rating: Number(event.target.value) },
          )
        }
      />
    );
  }
  if (column.type === 'link') {
    return (
      <Input
        aria-label="Link value"
        value={(shape.url as string | undefined) ?? ''}
        placeholder="https://"
        onChange={(event) => onChange({ url: event.target.value })}
      />
    );
  }
  const text = (shape.text as string | undefined) ?? (typeof value === 'string' ? value : '') ?? '';
  return (
    <Input
      aria-label="Text value"
      value={text}
      placeholder="Value"
      onChange={(event) => onChange({ text: event.target.value })}
    />
  );
}

function PeopleSelect({
  users,
  value,
  onChange,
  ariaLabel,
}: {
  users: User[];
  value: number | null;
  onChange: (id: number | null) => void;
  ariaLabel: string;
}) {
  return (
    <Select
      ariaLabel={ariaLabel}
      value={value ? String(value) : ''}
      options={users.map((user) => ({ value: String(user.id), label: user.name }))}
      onChange={(next) => onChange(next ? Number(next) : null)}
      placeholder="No one"
    />
  );
}

export function ConditionValue({
  column,
  value,
  users,
  onChange,
}: {
  column?: Column;
  value: Condition['value'];
  users: User[];
  onChange: (value: Condition['value']) => void;
}) {
  if (!column) return null;
  if (column.type === 'status') {
    return (
      <Select
        ariaLabel="Condition value"
        value={String(value ?? '')}
        options={(column.settings.labels ?? []).map((label) => ({
          value: label.id,
          label: label.name,
        }))}
        onChange={(next) => onChange(next)}
      />
    );
  }
  if (column.type === 'dropdown') {
    return (
      <Select
        ariaLabel="Condition value"
        value={String(value ?? '')}
        options={(column.settings.options ?? []).map((option) => ({
          value: option.id,
          label: option.name,
        }))}
        onChange={(next) => onChange(next)}
      />
    );
  }
  if (column.type === 'people') {
    return (
      <Select
        ariaLabel="Condition value"
        value={String(value ?? '')}
        options={users.map((user) => ({ value: String(user.id), label: user.name }))}
        onChange={(next) => onChange(Number(next))}
      />
    );
  }
  if (column.type === 'checkbox') {
    return (
      <Select
        ariaLabel="Condition value"
        value={String(value ?? 'yes')}
        options={[
          { value: 'yes', label: 'Checked' },
          { value: 'no', label: 'Unchecked' },
        ]}
        onChange={(next) => onChange(next)}
      />
    );
  }
  if (column.type === 'date') {
    return (
      <Input
        aria-label="Condition value"
        type="date"
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }
  if (['number', 'rating'].includes(column.type)) {
    return (
      <Input
        aria-label="Condition value"
        type="number"
        value={String(value ?? '')}
        onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
      />
    );
  }
  return (
    <Input
      aria-label="Condition value"
      value={String(value ?? '')}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function TargetSelect({
  value,
  onChange,
}: {
  value?: 'created';
  onChange: (target: 'created' | undefined) => void;
}) {
  return (
    <Select
      ariaLabel="Apply to"
      value={value ?? 'item'}
      options={[
        { value: 'item', label: 'The original item' },
        { value: 'created', label: 'The created subitem' },
      ]}
      onChange={(next) => onChange(next === 'created' ? 'created' : undefined)}
    />
  );
}

function ActionFields({
  action,
  onChange,
  full,
  users,
  boards,
  canTargetCreated,
}: {
  action: Action;
  onChange: (action: Action) => void;
  full: BoardFull;
  users: User[];
  boards: { id: number; name: string }[];
  canTargetCreated: boolean;
}) {
  const peopleColumns = full.columns.filter((column) => column.type === 'people');
  const settableColumns = full.columns.filter((column) => SETTABLE_TYPES.has(column.type));
  const textColumns = full.columns.filter(
    (column) => column.type === 'text' || column.type === 'long_text',
  );
  switch (action.type) {
    case 'set_value': {
      const column = full.columns.find((entry) => entry.id === action.columnId);
      return (
        <div className="space-y-2">
          {canTargetCreated && (
            <TargetSelect
              value={action.target}
              onChange={(target) => onChange({ ...action, target })}
            />
          )}
          <Select
            ariaLabel="Column to set"
            value={String(action.columnId)}
            options={settableColumns.map((entry) => ({
              value: String(entry.id),
              label: entry.title,
            }))}
            onChange={(next) =>
              onChange({
                ...action,
                columnId: Number(next),
                value: defaultValue(
                  full.columns.find((entry) => entry.id === Number(next)),
                  users,
                ),
              })
            }
          />
          <ValueField
            column={column}
            value={action.value}
            users={users}
            onChange={(value) => onChange({ ...action, value })}
          />
        </div>
      );
    }
    case 'move_to_group':
      return (
        <Select
          ariaLabel="Group"
          value={String(action.groupId)}
          options={full.groups.map((group) => ({ value: String(group.id), label: group.title }))}
          onChange={(next) => onChange({ ...action, groupId: Number(next) })}
        />
      );
    case 'assign': {
      const specificUserId =
        typeof action.who === 'object' && 'userId' in action.who ? action.who.userId : null;
      const fromColumnId =
        typeof action.who === 'object' && 'fromColumnId' in action.who
          ? action.who.fromColumnId
          : null;
      const whoValue =
        fromColumnId !== null
          ? 'column'
          : specificUserId !== null
            ? 'person'
            : typeof action.who === 'string'
              ? action.who
              : 'creator';
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {canTargetCreated && (
            <div className="sm:col-span-2">
              <TargetSelect
                value={action.target}
                onChange={(target) => onChange({ ...action, target })}
              />
            </div>
          )}
          <Select
            ariaLabel="People column"
            value={String(action.columnId)}
            options={peopleColumns.map((column) => ({
              value: String(column.id),
              label: column.title,
            }))}
            onChange={(next) => onChange({ ...action, columnId: Number(next) })}
          />
          <Select
            ariaLabel="Assign to"
            value={whoValue}
            options={[
              { value: 'creator', label: 'The creator' },
              { value: 'actor', label: 'The person who triggered it' },
              ...(users.length ? [{ value: 'person', label: 'A specific person' }] : []),
              ...(peopleColumns.length
                ? [{ value: 'column', label: 'The person in a column' }]
                : []),
            ]}
            onChange={(next) =>
              onChange({
                ...action,
                who:
                  next === 'person'
                    ? { userId: users[0]?.id ?? 0 }
                    : next === 'column'
                      ? { fromColumnId: peopleColumns[0]?.id ?? 0 }
                      : (next as 'creator' | 'actor'),
              })
            }
          />
          {fromColumnId !== null && (
            <div className="sm:col-span-2">
              <Select
                ariaLabel="Copy person from column"
                value={String(fromColumnId)}
                options={peopleColumns.map((column) => ({
                  value: String(column.id),
                  label: column.title,
                }))}
                onChange={(next) => onChange({ ...action, who: { fromColumnId: Number(next) } })}
              />
            </div>
          )}
          {specificUserId !== null && (
            <div className="sm:col-span-2">
              <Select
                ariaLabel="Person"
                value={String(specificUserId)}
                options={users.map((user) => ({ value: String(user.id), label: user.name }))}
                onChange={(next) => onChange({ ...action, who: { userId: Number(next) } })}
              />
            </div>
          )}
        </div>
      );
    }
    case 'notify': {
      const to = typeof action.to === 'object' ? 'people' : action.to;
      return (
        <div className="space-y-2">
          <Select
            ariaLabel="Notify who"
            value={to}
            options={[
              { value: 'creator', label: 'The creator' },
              { value: 'actor', label: 'The person who triggered it' },
              { value: 'assignees', label: 'Everyone assigned' },
              ...(users.length ? [{ value: 'people', label: 'Specific people' }] : []),
            ]}
            onChange={(next) =>
              onChange({
                ...action,
                to:
                  next === 'people' ? { userIds: [users[0]?.id ?? 0] } : (next as typeof action.to),
              })
            }
          />
          {typeof action.to === 'object' && (
            <Select
              ariaLabel="Notify person"
              value={String(action.to.userIds[0] ?? '')}
              options={users.map((user) => ({ value: String(user.id), label: user.name }))}
              onChange={(next) => onChange({ ...action, to: { userIds: [Number(next)] } })}
            />
          )}
          <Input
            aria-label="Notification message"
            value={action.message}
            onChange={(event) => onChange({ ...action, message: event.target.value })}
          />
          <p className="t-meta text-muted">
            Placeholders: {'{{name}}'}, {'{{boardName}}'}, {'{{actorName}}'} and column titles.
          </p>
        </div>
      );
    }
    case 'create_item':
      return (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              ariaLabel="Target board"
              value={String(action.boardId)}
              options={boards.map((board) => ({ value: String(board.id), label: board.name }))}
              onChange={(next) =>
                onChange({ ...action, boardId: Number(next), groupId: undefined })
              }
            />
            {action.boardId === full.board.id && (
              <Select
                ariaLabel="Target group"
                value={String(action.groupId ?? full.groups[0]?.id ?? '')}
                options={full.groups.map((group) => ({
                  value: String(group.id),
                  label: group.title,
                }))}
                onChange={(next) => onChange({ ...action, groupId: Number(next) })}
              />
            )}
          </div>
          <Input
            aria-label="Item name"
            value={action.name}
            onChange={(event) => onChange({ ...action, name: event.target.value })}
          />
        </div>
      );
    case 'create_subitem':
      return (
        <Input
          aria-label="Subitem name"
          value={action.name}
          onChange={(event) => onChange({ ...action, name: event.target.value })}
        />
      );
    case 'post_update':
      return (
        <div className="space-y-2">
          {canTargetCreated && (
            <TargetSelect
              value={action.target}
              onChange={(target) => onChange({ ...action, target })}
            />
          )}
          <Select
            ariaLabel="Mention people from column"
            value={action.mentionFromColumnId ? String(action.mentionFromColumnId) : 'none'}
            options={[
              { value: 'none', label: 'Do not tag anyone' },
              ...peopleColumns.map((column) => ({
                value: String(column.id),
                label: `Tag the people in ${column.title}`,
              })),
            ]}
            onChange={(next) =>
              onChange({
                ...action,
                mentionFromColumnId: next === 'none' ? undefined : Number(next),
              })
            }
          />
          <Textarea
            aria-label="Update body"
            rows={3}
            value={action.body}
            onChange={(event) => onChange({ ...action, body: event.target.value })}
          />
          <p className="t-meta text-muted">
            A mention is added at the start of the note and notifies the tagged person.
          </p>
        </div>
      );
    case 'archive_item':
      return <p className="t-meta text-muted">The item moves to the board trash.</p>;
    case 'ai_prompt':
      return (
        <div className="space-y-2">
          <Select
            ariaLabel="AI target column"
            value={String(action.targetColumnId)}
            options={textColumns.map((column) => ({
              value: String(column.id),
              label: column.title,
            }))}
            onChange={(next) => onChange({ ...action, targetColumnId: Number(next) })}
          />
          <Textarea
            aria-label="AI prompt"
            rows={2}
            value={action.prompt}
            onChange={(event) => onChange({ ...action, prompt: event.target.value })}
          />
        </div>
      );
    case 'send_webhook':
      return (
        <div className="space-y-2">
          <Input
            aria-label="Webhook URL"
            value={action.url}
            onChange={(event) => onChange({ ...action, url: event.target.value })}
          />
          <p className="t-meta text-muted">
            POSTs a signed JSON payload for every matching event. Use HTTPS in production.
          </p>
        </div>
      );
    default:
      return null;
  }
}

function BuilderSection({
  step,
  title,
  hint,
  children,
  aside,
}: {
  step: string;
  title: string;
  hint?: string;
  children: ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-sheet border border-line bg-surface p-3 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft t-meta font-semibold text-accent-soft-ink">
            {step}
          </span>
          <div className="min-w-0">
            <h3 className="t-label text-ink">{title}</h3>
            {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          </div>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function AutomationBuilder({
  full,
  users,
  boards,
  initial,
  automationId,
  onCancel,
  onSave,
}: {
  full: BoardFull;
  users: User[];
  boards: { id: number; name: string }[];
  initial: AutomationInput;
  automationId?: number;
  onCancel: () => void;
  onSave: (input: AutomationInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [trigger, setTrigger] = useState<Trigger>(initial.trigger);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [conditions, setConditions] = useState<Condition[]>(initial.conditions);
  const [actions, setActions] = useState<Action[]>(initial.actions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const statusColumns = full.columns.filter((column) => column.type === 'status');
  const peopleColumns = full.columns.filter((column) => column.type === 'people');
  const dateColumns = full.columns.filter(
    (column) => column.type === 'date' || column.type === 'timeline',
  );
  const triggerOptions = useMemo(
    () =>
      (Object.entries(TRIGGER_LABELS) as [Trigger['type'], string][])
        .filter(([type]) => {
          if (type === 'status_changed') return statusColumns.length > 0;
          if (type === 'person_assigned') return peopleColumns.length > 0;
          if (type === 'item_moved_to_group') return full.groups.length > 0;
          if (type === 'date_arrives' || type === 'date_passed') return dateColumns.length > 0;
          return true;
        })
        .map(([value, label]) => ({ value, label })),
    [dateColumns.length, full.groups.length, peopleColumns.length, statusColumns.length],
  );

  const ctx = useMemo(
    () => ({ columns: full.columns, groups: full.groups, users, boards }),
    [boards, full.columns, full.groups, users],
  );
  const preview = describeAutomation({ trigger, conditions, actions }, ctx);

  function updateCondition(index: number, next: Condition) {
    setConditions((current) => current.map((condition, i) => (i === index ? next : condition)));
  }

  function updateAction(index: number, next: Action) {
    setActions((current) => current.map((action, i) => (i === index ? next : action)));
  }

  async function save() {
    if (!name.trim()) {
      setError('Give the automation a name.');
      return;
    }
    if (!actions.length) {
      setError('Add at least one action.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        name: name.trim(),
        enabled,
        trigger,
        conditions,
        actions,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/95 px-4 py-2 backdrop-blur">
        <button
          aria-label="Back to automations"
          onClick={onCancel}
          className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="t-label text-ink">{automationId ? 'Edit automation' : 'New automation'}</p>
          <p className="t-meta text-muted">{full.board.name}</p>
        </div>
        <button
          type="button"
          aria-pressed={enabled}
          aria-label={enabled ? 'Pause automation' : 'Resume automation'}
          onClick={() => setEnabled((value) => !value)}
          className={cn(
            'inline-flex items-center gap-1 rounded-chip px-2 py-1 t-meta font-semibold transition-colors',
            enabled
              ? 'bg-success-soft text-success hover:bg-success-soft/70'
              : 'bg-sunken text-muted hover:text-ink',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', enabled ? 'bg-success' : 'bg-faint')} />
          {enabled ? 'Active' : 'Paused'}
        </button>
      </div>

      <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 py-5 sm:px-6">
        <div>
          <label htmlFor="automation-name" className="mb-1 block t-label text-ink">
            Name
          </label>
          <Input
            id="automation-name"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name this automation"
          />
        </div>

        <div className="rounded-pop border border-accent/25 bg-accent-soft/50 p-3">
          <div className="mb-1 flex items-center gap-1.5 t-meta font-semibold text-accent-soft-ink">
            <Sparkles size={13} />
            Preview
          </div>
          <AutomationSentence automation={{ trigger, conditions, actions }} ctx={ctx} />
        </div>

        <BuilderSection
          step="1"
          title="When this happens"
          hint="Pick the event that starts this automation."
        >
          <Select
            ariaLabel="When"
            value={trigger.type}
            options={triggerOptions}
            onChange={(next) => setTrigger(makeTrigger(next as Trigger['type'], full))}
          />
          {trigger.type === 'item_created' && full.groups.length > 0 && (
            <div className="mt-2 grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
              <span className="t-meta text-muted">created in</span>
              <Select
                ariaLabel="Trigger group"
                value={trigger.groupId ? String(trigger.groupId) : 'any'}
                options={[
                  { value: 'any', label: 'Any group' },
                  ...full.groups.map((group) => ({
                    value: String(group.id),
                    label: group.title,
                  })),
                ]}
                onChange={(next) =>
                  setTrigger(
                    next === 'any'
                      ? { type: 'item_created' }
                      : { type: 'item_created', groupId: Number(next) },
                  )
                }
              />
            </div>
          )}
          {trigger.type === 'status_changed' && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Select
                ariaLabel="Status column"
                value={String(trigger.columnId)}
                options={statusColumns.map((column) => ({
                  value: String(column.id),
                  label: column.title,
                }))}
                onChange={(next) =>
                  setTrigger({ ...trigger, columnId: Number(next), toLabelId: null })
                }
              />
              <Select
                ariaLabel="Status value"
                value={trigger.toLabelId ?? 'any'}
                options={[
                  { value: 'any', label: 'Any status' },
                  ...(statusColumns
                    .find((column) => column.id === trigger.columnId)
                    ?.settings.labels?.map((label) => ({
                      value: label.id,
                      label: label.name,
                    })) ?? []),
                ]}
                onChange={(next) =>
                  setTrigger({ ...trigger, toLabelId: next === 'any' ? null : next })
                }
              />
            </div>
          )}
          {trigger.type === 'column_changed' && (
            <div className="mt-2">
              <Select
                ariaLabel="Column"
                value={String(trigger.columnId)}
                options={full.columns.map((column) => ({
                  value: String(column.id),
                  label: column.title,
                }))}
                onChange={(next) => setTrigger({ ...trigger, columnId: Number(next) })}
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
                onChange={(next) => setTrigger({ ...trigger, columnId: Number(next) })}
              />
            </div>
          )}
          {trigger.type === 'item_moved_to_group' && (
            <div className="mt-2">
              <Select
                ariaLabel="Group"
                value={String(trigger.groupId)}
                options={full.groups.map((group) => ({
                  value: String(group.id),
                  label: group.title,
                }))}
                onChange={(next) => setTrigger({ ...trigger, groupId: Number(next) })}
              />
            </div>
          )}
          {trigger.type === 'date_passed' && (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_88px]">
              <Select
                ariaLabel="Date column"
                value={String(trigger.columnId)}
                options={dateColumns.map((column) => ({
                  value: String(column.id),
                  label: column.title,
                }))}
                onChange={(next) => setTrigger({ ...trigger, columnId: Number(next) })}
              />
              <div>
                <label className="mb-1 block t-meta text-muted" htmlFor="passed-hour">
                  Check at hour
                </label>
                <Input
                  id="passed-hour"
                  type="number"
                  min={0}
                  max={23}
                  value={trigger.hour}
                  onChange={(event) => setTrigger({ ...trigger, hour: Number(event.target.value) })}
                />
              </div>
            </div>
          )}
          {trigger.type === 'date_arrives' && (
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_88px_88px]">
              <Select
                ariaLabel="Date column"
                value={String(trigger.columnId)}
                options={dateColumns.map((column) => ({
                  value: String(column.id),
                  label: column.title,
                }))}
                onChange={(next) => setTrigger({ ...trigger, columnId: Number(next) })}
              />
              <div>
                <label className="mb-1 block t-meta text-muted" htmlFor="offset-days">
                  Days offset
                </label>
                <Input
                  id="offset-days"
                  type="number"
                  min={-30}
                  max={30}
                  value={trigger.offsetDays}
                  onChange={(event) =>
                    setTrigger({ ...trigger, offsetDays: Number(event.target.value) })
                  }
                />
              </div>
              <div>
                <label className="mb-1 block t-meta text-muted" htmlFor="offset-hour">
                  Hour
                </label>
                <Input
                  id="offset-hour"
                  type="number"
                  min={0}
                  max={23}
                  value={trigger.hour}
                  onChange={(event) => setTrigger({ ...trigger, hour: Number(event.target.value) })}
                />
              </div>
            </div>
          )}
          {trigger.type === 'recurring' && (
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <Select
                ariaLabel="Repeats"
                value={trigger.every}
                options={[
                  { value: 'day', label: 'Every day' },
                  { value: 'weekday', label: 'Every weekday' },
                  { value: 'week', label: 'Every week' },
                  { value: 'month', label: 'Every month' },
                ]}
                onChange={(next) => setTrigger({ ...trigger, every: next as typeof trigger.every })}
              />
              {trigger.every === 'week' && (
                <Select
                  ariaLabel="Weekday"
                  value={String(trigger.weekday ?? 1)}
                  options={[
                    'Sunday',
                    'Monday',
                    'Tuesday',
                    'Wednesday',
                    'Thursday',
                    'Friday',
                    'Saturday',
                  ].map((label, index) => ({ value: String(index), label }))}
                  onChange={(next) => setTrigger({ ...trigger, weekday: Number(next) })}
                />
              )}
              {trigger.every === 'month' && (
                <div>
                  <label className="mb-1 block t-meta text-muted" htmlFor="day-of-month">
                    Day
                  </label>
                  <Input
                    id="day-of-month"
                    type="number"
                    min={1}
                    max={31}
                    value={trigger.dayOfMonth ?? 1}
                    onChange={(event) =>
                      setTrigger({ ...trigger, dayOfMonth: Number(event.target.value) })
                    }
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block t-meta text-muted" htmlFor="recurring-hour">
                  Hour
                </label>
                <Input
                  id="recurring-hour"
                  type="number"
                  min={0}
                  max={23}
                  value={trigger.hour}
                  onChange={(event) => setTrigger({ ...trigger, hour: Number(event.target.value) })}
                />
              </div>
            </div>
          )}
        </BuilderSection>

        <BuilderSection
          step="2"
          title="Only if"
          hint="All conditions must match. Leave empty to always run."
          aside={
            <button
              className="inline-flex items-center gap-1 t-meta font-semibold text-accent hover:text-accent-hover"
              onClick={() =>
                setConditions((current) => [
                  ...current,
                  {
                    columnId: full.columns[0]?.id ?? 0,
                    op: 'is',
                    value: defaultConditionValue(full.columns[0], users),
                  },
                ])
              }
            >
              <Plus size={12} /> Add condition
            </button>
          }
        >
          {conditions.length === 0 ? (
            <p className="t-meta text-muted">No conditions — this runs for every matching event.</p>
          ) : (
            <div className="space-y-2">
              {conditions.map((condition, index) => {
                const column = full.columns.find((entry) => entry.id === condition.columnId);
                const ops = conditionOps(column);
                return (
                  <div
                    key={index}
                    className="grid gap-2 rounded-control border border-line bg-surface-2 p-2 sm:grid-cols-[1.2fr_1fr_1.1fr_auto] sm:items-center"
                  >
                    <Select
                      ariaLabel="Condition column"
                      value={String(condition.columnId)}
                      options={full.columns.map((entry) => ({
                        value: String(entry.id),
                        label: entry.title,
                      }))}
                      onChange={(next) => {
                        const nextColumn = full.columns.find((entry) => entry.id === Number(next));
                        updateCondition(index, {
                          ...condition,
                          columnId: Number(next),
                          op: conditionOps(nextColumn)[0],
                          value: defaultConditionValue(nextColumn, users),
                        });
                      }}
                    />
                    <Select
                      ariaLabel="Condition operator"
                      value={condition.op}
                      options={ops.map((op) => ({ value: op, label: OP_LABELS[op] }))}
                      onChange={(next) =>
                        updateCondition(index, { ...condition, op: next as FilterOp })
                      }
                    />
                    {condition.op === 'is_empty' || condition.op === 'is_not_empty' ? (
                      <span className="t-meta text-muted">No value needed</span>
                    ) : (
                      <ConditionValue
                        column={column}
                        value={condition.value}
                        users={users}
                        onChange={(value) => updateCondition(index, { ...condition, value })}
                      />
                    )}
                    <button
                      aria-label="Remove condition"
                      className="justify-self-start rounded-control p-1 text-muted hover:bg-sunken hover:text-danger sm:justify-self-center"
                      onClick={() =>
                        setConditions((current) => current.filter((_, i) => i !== index))
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </BuilderSection>

        <BuilderSection
          step="3"
          title="Then do this"
          hint="Actions run in order, top to bottom."
          aside={
            <button
              className="inline-flex items-center gap-1 t-meta font-semibold text-accent hover:text-accent-hover"
              onClick={() =>
                setActions((current) => [...current, makeAction('notify', full, users)])
              }
            >
              <Plus size={12} /> Add action
            </button>
          }
        >
          <div className="space-y-2">
            {actions.map((action, index) => (
              <div key={index} className="rounded-control border border-line bg-surface-2 p-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft t-meta font-semibold text-accent-soft-ink">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <ActionTypeMenu
                      action={action}
                      onChange={(next) => updateAction(index, makeAction(next.type, full, users))}
                    />
                  </div>
                  <button
                    aria-label="Move action up"
                    disabled={index === 0}
                    className="rounded-control p-1 text-muted hover:bg-sunken hover:text-ink disabled:opacity-30"
                    onClick={() =>
                      setActions((current) => {
                        if (index === 0) return current;
                        const next = [...current];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        return next;
                      })
                    }
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    aria-label="Move action down"
                    disabled={index === actions.length - 1}
                    className="rounded-control p-1 text-muted hover:bg-sunken hover:text-ink disabled:opacity-30"
                    onClick={() =>
                      setActions((current) => {
                        if (index === current.length - 1) return current;
                        const next = [...current];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        return next;
                      })
                    }
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    aria-label="Remove action"
                    className="rounded-control p-1 text-muted hover:bg-sunken hover:text-danger"
                    onClick={() => setActions((current) => current.filter((_, i) => i !== index))}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="mt-2 pl-7">
                  <ActionFields
                    action={action}
                    onChange={(next) => updateAction(index, next)}
                    full={full}
                    users={users}
                    boards={boards}
                    canTargetCreated={actions
                      .slice(0, index)
                      .some((entry) => entry.type === 'create_subitem')}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong/40 py-2 t-meta font-medium text-muted hover:border-accent hover:text-accent"
            onClick={() => setActions((current) => [...current, makeAction('notify', full, users)])}
          >
            <Plus size={13} /> Add another action
          </button>
        </BuilderSection>

        {error && (
          <p role="alert" className="text-sm text-danger-text">
            {error}
          </p>
        )}

        <div className="rounded-pop border border-line bg-surface-2 p-3">
          <p className="mb-1 flex items-center gap-1.5 t-meta font-semibold text-muted">
            <Bell size={12} /> Full read-back
          </p>
          <p className="text-sm leading-6 text-ink">{preview}</p>
          <p className="mt-2 flex items-center gap-1 t-meta text-muted">
            <CalendarClock size={12} /> Runs as the automation owner, with a full run log.
          </p>
        </div>
      </div>

      <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-line bg-surface px-4 py-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          {error && <span className="t-meta text-danger-text">Not saved</span>}
          <Button loading={saving} disabled={!name.trim() || actions.length === 0} onClick={save}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
