import { z } from 'zod';
import type { Column, FilterOp, Group, User } from './types';

export type Trigger =
  | { type: 'item_created'; groupId?: number }
  | { type: 'subitem_created' }
  | { type: 'status_changed'; columnId: number; toLabelId: string | null }
  | { type: 'column_changed'; columnId: number }
  | { type: 'person_assigned'; columnId: number }
  | { type: 'item_moved_to_group'; groupId: number }
  | { type: 'update_posted' }
  | { type: 'date_arrives'; columnId: number; offsetDays: number; hour: number }
  | { type: 'date_passed'; columnId: number; hour: number }
  | {
      type: 'recurring';
      every: 'day' | 'weekday' | 'week' | 'month';
      weekday?: number;
      dayOfMonth?: number;
      hour: number;
    };

export interface Condition {
  columnId: number;
  op: FilterOp;
  value: string | number | null;
}

export type AssigneeRef = 'creator' | 'actor' | { userId: number } | { fromColumnId: number };

export type ActionTarget = 'created';

export type Action =
  | { type: 'set_value'; columnId: number; value: unknown | null; target?: ActionTarget }
  | { type: 'move_to_group'; groupId: number }
  | { type: 'assign'; columnId: number; who: AssigneeRef; target?: ActionTarget }
  | {
      type: 'notify';
      to: 'assignees' | 'creator' | 'actor' | { userIds: number[] };
      message: string;
    }
  | { type: 'create_item'; boardId: number; groupId?: number; name: string }
  | { type: 'create_subitem'; name: string }
  | {
      type: 'post_update';
      body: string;
      target?: ActionTarget;
      mentionFromColumnId?: number;
    }
  | { type: 'archive_item' }
  | { type: 'ai_prompt'; prompt: string; targetColumnId: number }
  | { type: 'send_webhook'; url: string };

export interface Automation {
  id: number;
  boardId: number;
  name: string;
  enabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  runCount: number;
  lastRunAt: string | null;
}

export interface AutomationRun {
  id: number;
  automationId: number;
  itemId: number | null;
  status: 'success' | 'failed' | 'skipped';
  error: string | null;
  createdAt: string;
}

export const ITEMLESS_ACTIONS: Action['type'][] = ['create_item', 'notify', 'send_webhook'];

export interface AutomationDraft {
  name: string;
  trigger: {
    type: Trigger['type'];
    column?: string;
    toLabel?: string | null;
    group?: string;
    offsetDays?: number;
    hour?: number;
    every?: string;
    weekday?: number;
    dayOfMonth?: number;
  };
  conditions: { column: string; op: FilterOp; value: string | number | null }[];
  actions: {
    type: Action['type'];
    column?: string;
    value?: string | null;
    group?: string;
    board?: string;
    who?: string;
    fromColumn?: string;
    target?: string;
    mentionColumn?: string;
    to?: string;
    message?: string;
    name?: string;
    body?: string;
    prompt?: string;
    url?: string;
  }[];
}

const filterOpSchema = z.enum(['is', 'is_not', 'contains', 'is_empty', 'is_not_empty', 'gt', 'lt']);

export const triggerSchema: z.ZodType<Trigger> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('item_created'), groupId: z.number().int().positive().optional() }),
  z.object({ type: z.literal('subitem_created') }),
  z.object({
    type: z.literal('status_changed'),
    columnId: z.number().int().positive(),
    toLabelId: z.string().max(40).nullable(),
  }),
  z.object({ type: z.literal('column_changed'), columnId: z.number().int().positive() }),
  z.object({ type: z.literal('person_assigned'), columnId: z.number().int().positive() }),
  z.object({ type: z.literal('item_moved_to_group'), groupId: z.number().int().positive() }),
  z.object({ type: z.literal('update_posted') }),
  z.object({
    type: z.literal('date_arrives'),
    columnId: z.number().int().positive(),
    offsetDays: z.number().int().min(-30).max(30),
    hour: z.number().int().min(0).max(23),
  }),
  z.object({
    type: z.literal('date_passed'),
    columnId: z.number().int().positive(),
    hour: z.number().int().min(0).max(23),
  }),
  z.object({
    type: z.literal('recurring'),
    every: z.enum(['day', 'weekday', 'week', 'month']),
    weekday: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    hour: z.number().int().min(0).max(23),
  }),
]) as z.ZodType<Trigger>;

export const conditionSchema = z.object({
  columnId: z.number().int().positive(),
  op: filterOpSchema,
  value: z.union([z.string(), z.number(), z.null()]),
});

export const assigneeRefSchema = z.union([
  z.literal('creator'),
  z.literal('actor'),
  z.object({ userId: z.number().int().positive() }),
  z.object({ fromColumnId: z.number().int().positive() }),
]);

const actionTargetSchema = z.literal('created').optional();

export const actionSchema: z.ZodType<Action> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('set_value'),
    columnId: z.number().int().positive(),
    value: z.unknown().nullable(),
    target: actionTargetSchema,
  }),
  z.object({ type: z.literal('move_to_group'), groupId: z.number().int().positive() }),
  z.object({
    type: z.literal('assign'),
    columnId: z.number().int().positive(),
    who: assigneeRefSchema,
    target: actionTargetSchema,
  }),
  z.object({
    type: z.literal('notify'),
    to: z.union([
      z.enum(['assignees', 'creator', 'actor']),
      z.object({ userIds: z.array(z.number().int().positive()).max(100) }),
    ]),
    message: z.string().min(1).max(2000),
  }),
  z.object({
    type: z.literal('create_item'),
    boardId: z.number().int().positive(),
    groupId: z.number().int().positive().optional(),
    name: z.string().min(1).max(200),
  }),
  z.object({ type: z.literal('create_subitem'), name: z.string().min(1).max(200) }),
  z.object({
    type: z.literal('post_update'),
    body: z.string().min(1).max(20000),
    target: actionTargetSchema,
    mentionFromColumnId: z.number().int().positive().optional(),
  }),
  z.object({ type: z.literal('archive_item') }),
  z.object({
    type: z.literal('ai_prompt'),
    prompt: z.string().min(1).max(4000),
    targetColumnId: z.number().int().positive(),
  }),
  z.object({ type: z.literal('send_webhook'), url: z.string().max(2000) }),
]) as z.ZodType<Action>;

export const automationInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().optional(),
  trigger: triggerSchema,
  conditions: z.array(conditionSchema).max(10).default([]),
  actions: z.array(actionSchema).min(1).max(10),
});

export type AutomationInput = z.infer<typeof automationInputSchema>;

export type AutomationTemplateCategory =
  'communicate' | 'assign' | 'schedule' | 'organize' | 'create' | 'ai';

export interface BoardAutomationTemplate {
  title: string;
  rationale: string;
  category: AutomationTemplateCategory;
  input: AutomationInput;
}

export interface BoardAutomationTemplateSet {
  templates: BoardAutomationTemplate[];
  generatedAt: string | null;
}

function columnName(ctx: { columns: Column[] }, columnId: number): string {
  return ctx.columns.find((column) => column.id === columnId)?.title ?? `column ${columnId}`;
}

function labelName(column: Column | undefined, labelId: string | null): string {
  if (!labelId) return 'any value';
  return column?.settings.labels?.find((label) => label.id === labelId)?.name ?? labelId;
}

export interface AutomationDescriptionPart {
  text: string;
  tone?: 'trigger' | 'condition' | 'action';
}

export interface AutomationDescriptionContext {
  columns: Column[];
  groups: Group[];
  users: User[];
  boards: { id: number; name: string }[];
}

export function describeAutomationParts(
  automation: Pick<Automation, 'trigger' | 'conditions' | 'actions'>,
  ctx: AutomationDescriptionContext,
): AutomationDescriptionPart[] {
  const column = (id: number) => ctx.columns.find((entry) => entry.id === id);
  const group = (id: number) => ctx.groups.find((entry) => entry.id === id)?.title ?? 'group';
  const user = (id: number) => ctx.users.find((entry) => entry.id === id)?.name ?? 'someone';
  const board = (id: number) => ctx.boards.find((entry) => entry.id === id)?.name ?? 'board';
  const t = automation.trigger;
  let when: string;
  switch (t.type) {
    case 'item_created':
      when = t.groupId ? `an item is created in ${group(t.groupId)}` : 'an item is created';
      break;
    case 'subitem_created':
      when = 'a subitem is created';
      break;
    case 'status_changed':
      when = `${columnName(ctx, t.columnId)} changes to ${labelName(column(t.columnId), t.toLabelId)}`;
      break;
    case 'column_changed':
      when = `${columnName(ctx, t.columnId)} changes`;
      break;
    case 'person_assigned':
      when = `${columnName(ctx, t.columnId)} is assigned`;
      break;
    case 'item_moved_to_group':
      when = `an item moves to ${group(t.groupId)}`;
      break;
    case 'update_posted':
      when = 'an update is posted';
      break;
    case 'date_passed':
      when = `${columnName(ctx, t.columnId)} has passed (checked daily at ${String(t.hour).padStart(2, '0')}:00)`;
      break;
    case 'date_arrives': {
      const timing =
        t.offsetDays === 0
          ? 'on the day'
          : t.offsetDays < 0
            ? `${Math.abs(t.offsetDays)} day${Math.abs(t.offsetDays) === 1 ? '' : 's'} before`
            : `${t.offsetDays} day${t.offsetDays === 1 ? '' : 's'} after`;
      when = `${columnName(ctx, t.columnId)} arrives (${timing}, ${String(t.hour).padStart(2, '0')}:00)`;
      break;
    }
    case 'recurring': {
      const at = `${String(t.hour).padStart(2, '0')}:00`;
      if (t.every === 'day') when = `every day at ${at}`;
      else if (t.every === 'weekday') when = `every weekday at ${at}`;
      else if (t.every === 'week')
        when = `every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][t.weekday ?? 1]} at ${at}`;
      else when = `every month on day ${t.dayOfMonth ?? 1} at ${at}`;
      break;
    }
  }

  const conditions = automation.conditions.map((condition) => {
    const col = column(condition.columnId);
    const value = col
      ? col.type === 'status'
        ? labelName(col, typeof condition.value === 'string' ? condition.value : null)
        : String(condition.value ?? '')
      : '';
    return `${columnName(ctx, condition.columnId)} ${condition.op.replace(/_/g, ' ')}${value ? ` ${value}` : ''}`;
  });

  const actionText = (action: Action): string => {
    switch (action.type) {
      case 'set_value': {
        const col = column(action.columnId);
        const raw = action.value;
        let value = String(raw ?? 'empty');
        if (raw && typeof raw === 'object') {
          const shape = raw as Record<string, unknown>;
          if (col?.type === 'status') {
            value = labelName(col, (shape.labelId as string) ?? null);
          } else if (col?.type === 'dropdown') {
            const ids = (shape.optionIds as string[]) ?? [];
            value =
              ids
                .map((id) => col.settings.options?.find((option) => option.id === id)?.name ?? id)
                .join(', ') || 'empty';
          } else if (col?.type === 'people') {
            const ids = (shape.userIds as number[]) ?? [];
            value = ids.map(user).join(', ') || 'nobody';
          } else if (typeof shape.relativeDays === 'number') {
            const days = shape.relativeDays;
            value =
              days === 0
                ? 'today'
                : days > 0
                  ? `${days} day${days === 1 ? '' : 's'} from today`
                  : `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
          } else if (typeof shape.date === 'string') {
            value = shape.date;
          } else if (typeof shape.from === 'string' && typeof shape.to === 'string') {
            value = `${shape.from} → ${shape.to}`;
          } else if (typeof shape.checked === 'boolean') {
            value = shape.checked ? 'checked' : 'unchecked';
          } else if (typeof shape.text === 'string') {
            value = shape.text;
          } else if (typeof shape.number === 'number') {
            value = String(shape.number);
          } else if (typeof shape.rating === 'number') {
            value = String(shape.rating);
          } else if (typeof shape.url === 'string') {
            value = shape.url;
          } else {
            value = 'a value';
          }
        }
        return `set ${columnName(ctx, action.columnId)} to ${value}${action.target === 'created' ? ' on the created subitem' : ''}`;
      }
      case 'move_to_group':
        return `move the item to ${group(action.groupId)}`;
      case 'assign': {
        const who =
          action.who === 'creator'
            ? 'the creator'
            : action.who === 'actor'
              ? 'the person who triggered it'
              : 'fromColumnId' in action.who
                ? `the person in ${columnName(ctx, action.who.fromColumnId)}`
                : user(action.who.userId);
        return `assign ${who} to ${columnName(ctx, action.columnId)}${action.target === 'created' ? ' on the created subitem' : ''}`;
      }
      case 'notify': {
        const to =
          typeof action.to === 'object'
            ? action.to.userIds.map(user).join(', ')
            : `the ${action.to}`;
        return `notify ${to}: “${action.message}”`;
      }
      case 'create_item':
        return `create item “${action.name}” on ${board(action.boardId)}`;
      case 'create_subitem':
        return `create subitem “${action.name}”`;
      case 'post_update': {
        const target = action.target === 'created' ? ' on the created subitem' : '';
        const mention = action.mentionFromColumnId
          ? ` mentioning the people in ${columnName(ctx, action.mentionFromColumnId)}`
          : '';
        return `post an update${target}${mention}`;
      }
      case 'archive_item':
        return 'archive the item';
      case 'ai_prompt':
        return `ask AI to fill ${columnName(ctx, action.targetColumnId)}`;
      case 'send_webhook':
        return 'send a webhook';
    }
  };

  const parts: AutomationDescriptionPart[] = [{ text: 'When ' }];
  parts.push({ text: when, tone: 'trigger' });
  if (conditions.length) {
    parts.push({ text: ', and if ' });
    conditions.forEach((condition, index) => {
      if (index) parts.push({ text: ' and ' });
      parts.push({ text: condition, tone: 'condition' });
    });
  }
  parts.push({ text: ', then ' });
  automation.actions.forEach((action, index) => {
    if (index) parts.push({ text: ', ' });
    parts.push({ text: actionText(action), tone: 'action' });
  });
  return parts;
}

export function describeAutomation(
  automation: Pick<Automation, 'trigger' | 'conditions' | 'actions'>,
  ctx: AutomationDescriptionContext,
): string {
  return describeAutomationParts(automation, ctx)
    .map((part) => part.text)
    .join('');
}
