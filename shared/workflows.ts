import { z } from 'zod';
import { conditionSchema, type Condition } from './automations';

export type WorkflowTrigger =
  | { type: 'item_created'; groupId?: number }
  | { type: 'status_changed'; columnId: number; toLabelId: string | null }
  | { type: 'column_changed'; columnId: number }
  | { type: 'person_assigned'; columnId: number }
  | { type: 'item_moved_to_group'; groupId: number }
  | { type: 'update_posted' };

export type WorkflowStep =
  | { type: 'create_item'; boardId: number; groupId?: number; name: string }
  | { type: 'copy_value'; sourceColumnId: number; targetColumnId: number }
  | { type: 'assign_from'; sourceColumnId: number; targetColumnId: number }
  | { type: 'set_value'; columnId: number; value: unknown | null }
  | { type: 'move_to_group'; groupId: number }
  | { type: 'post_update'; body: string; mentionFromColumnId?: number }
  | {
      type: 'notify';
      to: 'creator' | 'actor' | 'assignees' | { userIds: number[] };
      message: string;
    };

export interface Workflow {
  id: number;
  name: string;
  description: string;
  enabled: boolean;
  triggerBoardId: number;
  trigger: WorkflowTrigger;
  conditions: Condition[];
  steps: WorkflowStep[];
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  runCount: number;
  lastRunAt: string | null;
}

export interface WorkflowRun {
  id: number;
  workflowId: number;
  sourceItemId: number | null;
  createdItemId: number | null;
  status: 'success' | 'failed' | 'skipped';
  error: string | null;
  createdAt: string;
}

export const workflowTriggerSchema: z.ZodType<WorkflowTrigger> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('item_created'), groupId: z.number().int().positive().optional() }),
  z.object({
    type: z.literal('status_changed'),
    columnId: z.number().int().positive(),
    toLabelId: z.string().max(40).nullable(),
  }),
  z.object({ type: z.literal('column_changed'), columnId: z.number().int().positive() }),
  z.object({ type: z.literal('person_assigned'), columnId: z.number().int().positive() }),
  z.object({ type: z.literal('item_moved_to_group'), groupId: z.number().int().positive() }),
  z.object({ type: z.literal('update_posted') }),
]) as z.ZodType<WorkflowTrigger>;

export const workflowStepSchema: z.ZodType<WorkflowStep> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_item'),
    boardId: z.number().int().positive(),
    groupId: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(200),
  }),
  z.object({
    type: z.literal('copy_value'),
    sourceColumnId: z.number().int().positive(),
    targetColumnId: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('assign_from'),
    sourceColumnId: z.number().int().positive(),
    targetColumnId: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('set_value'),
    columnId: z.number().int().positive(),
    value: z.unknown().nullable(),
  }),
  z.object({ type: z.literal('move_to_group'), groupId: z.number().int().positive() }),
  z.object({
    type: z.literal('post_update'),
    body: z.string().min(1).max(20000),
    mentionFromColumnId: z.number().int().positive().optional(),
  }),
  z.object({
    type: z.literal('notify'),
    to: z.union([
      z.enum(['creator', 'actor', 'assignees']),
      z.object({ userIds: z.array(z.number().int().positive()).max(100) }),
    ]),
    message: z.string().min(1).max(2000),
  }),
]) as z.ZodType<WorkflowStep>;

export const workflowInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).default(''),
  enabled: z.boolean().optional(),
  triggerBoardId: z.number().int().positive(),
  trigger: workflowTriggerSchema,
  conditions: z.array(conditionSchema).max(10).default([]),
  steps: z.array(workflowStepSchema).min(1).max(20),
});

export type WorkflowInput = z.infer<typeof workflowInputSchema>;

export function describeWorkflowTrigger(
  trigger: WorkflowTrigger,
  ctx: {
    columns: {
      id: number;
      title: string;
      settings?: { labels?: { id: string; name: string }[] };
    }[];
    groups: { id: number; title: string }[];
  },
): string {
  const column = (id: number) => ctx.columns.find((entry) => entry.id === id);
  const group = (id: number) => ctx.groups.find((entry) => entry.id === id)?.title ?? 'group';
  switch (trigger.type) {
    case 'item_created':
      return trigger.groupId
        ? `an item is created in ${group(trigger.groupId)}`
        : 'an item is created';
    case 'status_changed': {
      const target = column(trigger.columnId);
      const label = target?.settings?.labels?.find((entry) => entry.id === trigger.toLabelId)?.name;
      return `${target?.title ?? 'Status'} changes to ${label ?? 'any status'}`;
    }
    case 'column_changed':
      return `${column(trigger.columnId)?.title ?? 'A column'} changes`;
    case 'person_assigned':
      return `${column(trigger.columnId)?.title ?? 'A people column'} is assigned`;
    case 'item_moved_to_group':
      return `an item moves to ${group(trigger.groupId)}`;
    case 'update_posted':
      return 'an update is posted';
  }
}

export function describeWorkflowStep(
  step: WorkflowStep,
  ctx: {
    columns: { id: number; title: string }[];
    groups: { id: number; title: string }[];
    boards: { id: number; name: string }[];
  },
): string {
  const column = (id: number) => ctx.columns.find((entry) => entry.id === id)?.title ?? 'column';
  const group = (id: number) => ctx.groups.find((entry) => entry.id === id)?.title ?? 'group';
  const board = (id: number) => ctx.boards.find((entry) => entry.id === id)?.name ?? 'board';
  switch (step.type) {
    case 'create_item':
      return `create “${step.name}” on ${board(step.boardId)}`;
    case 'copy_value':
      return `copy ${column(step.sourceColumnId)} to ${column(step.targetColumnId)}`;
    case 'assign_from':
      return `assign the person in ${column(step.sourceColumnId)} to ${column(step.targetColumnId)}`;
    case 'set_value':
      return `set ${column(step.columnId)}`;
    case 'move_to_group':
      return `move to ${group(step.groupId)}`;
    case 'post_update':
      return step.mentionFromColumnId
        ? `post an update tagging ${column(step.mentionFromColumnId)}`
        : 'post an update';
    case 'notify':
      return `notify ${typeof step.to === 'string' ? step.to : 'people'}`;
  }
}
