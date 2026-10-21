import type { AutomationInput, AutomationTemplateCategory } from '../../../../shared/automations';
import type { BoardFull, User } from '../../../../shared/types';
import { doneLabelFor } from '../../../../shared/columns';
import type { RecipeSegment } from './parts';

export type RecipeCategory = 'communicate' | 'assign' | 'schedule' | 'organize' | 'create' | 'ai';

export interface AutomationRecipe {
  id: string;
  category: RecipeCategory;
  title: string;
  description: string;
  segments: RecipeSegment[];
  input: AutomationInput;
}

export const RECIPE_CATEGORIES: {
  id: RecipeCategory;
  label: string;
  description: string;
}[] = [
  { id: 'communicate', label: 'Communicate', description: 'Keep the right people in the loop.' },
  { id: 'assign', label: 'Assign', description: 'Give work an owner automatically.' },
  { id: 'schedule', label: 'Schedule', description: 'Run things on a date or a rhythm.' },
  { id: 'organize', label: 'Organize', description: 'Move, archive and tidy the board.' },
  { id: 'create', label: 'Create', description: 'Spin up items and subitems for people.' },
  { id: 'ai', label: 'AI', description: 'Let Tuesday do the writing.' },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleSegments(title: string, values: string[]): RecipeSegment[] {
  const phrases = [...new Set(values.filter((value) => value.trim()))].sort(
    (a, b) => b.length - a.length,
  );
  if (!phrases.length) return [{ text: title }];
  const lookup = new Set(phrases);
  const matcher = new RegExp(`(${phrases.map(escapeRegExp).join('|')})`, 'g');
  return title
    .split(matcher)
    .filter((part) => part.length > 0)
    .map((part) => (lookup.has(part) ? { text: part, tone: 'value' as const } : { text: part }));
}

export function buildRecipes(full: BoardFull, _users: User[]): AutomationRecipe[] {
  const status = full.columns.find((column) => column.type === 'status');
  const labels = status?.settings.labels ?? [];
  const doneId = status ? doneLabelFor(status) : null;
  const doneName = labels.find((label) => label.id === doneId)?.name ?? 'Done';
  const otherLabel = labels.find((label) => label.id !== doneId);
  const people = full.columns.find((column) => column.type === 'people');
  const date = full.columns.find((column) => column.type === 'date');
  const text = full.columns.find((column) => column.type === 'long_text' || column.type === 'text');
  const firstGroup = full.groups[0];
  const completedGroup =
    full.groups.find((group) => /completed|done/i.test(group.title)) ??
    full.groups[full.groups.length - 1];
  const boardId = full.board.id;
  const recipes: AutomationRecipe[] = [];

  const add = (recipe: Omit<AutomationRecipe, 'segments'> & { highlight: string[] }) => {
    const { highlight, ...rest } = recipe;
    recipes.push({ ...rest, segments: titleSegments(rest.title, highlight) });
  };

  if (status && doneId && completedGroup) {
    add({
      id: 'move_done',
      category: 'organize',
      title: `When status changes to ${doneName}, move item to ${completedGroup.title}`,
      description: 'Close the loop: finished work leaves the active group on its own.',
      highlight: [doneName, completedGroup.title],
      input: {
        name: 'Move when done',
        enabled: true,
        trigger: { type: 'status_changed', columnId: status.id, toLabelId: doneId },
        conditions: [],
        actions: [{ type: 'move_to_group', groupId: completedGroup.id }],
      },
    });
    add({
      id: 'notify_done',
      category: 'communicate',
      title: `When status changes to ${doneName}, notify the creator`,
      description: 'A quiet ping when the work is finished, with the item linked.',
      highlight: [doneName],
      input: {
        name: 'Notify when done',
        enabled: true,
        trigger: { type: 'status_changed', columnId: status.id, toLabelId: doneId },
        conditions: [],
        actions: [{ type: 'notify', to: 'creator', message: '{{name}} is done' }],
      },
    });
    add({
      id: 'post_update_done',
      category: 'communicate',
      title: `When status changes to ${doneName}, post an update`,
      description: 'Leave an audit trail in the item conversation.',
      highlight: [doneName],
      input: {
        name: 'Update when done',
        enabled: true,
        trigger: { type: 'status_changed', columnId: status.id, toLabelId: doneId },
        conditions: [],
        actions: [{ type: 'post_update', body: '{{name}} is now done.' }],
      },
    });
  }

  if (status && doneId && text) {
    add({
      id: 'ai_summary',
      category: 'ai',
      title: `When status changes to ${doneName}, summarize updates into ${text.title}`,
      description: 'Tuesday reads the thread and writes the recap into your column.',
      highlight: [doneName, text.title],
      input: {
        name: 'Summarize when done',
        enabled: true,
        trigger: { type: 'status_changed', columnId: status.id, toLabelId: doneId },
        conditions: [],
        actions: [
          {
            type: 'ai_prompt',
            prompt: 'Summarize the updates on {{name}} in three short bullets.',
            targetColumnId: text.id,
          },
        ],
      },
    });
  }

  if (people) {
    add({
      id: 'assign_creator',
      category: 'assign',
      title: 'When an item is created, assign the creator',
      description: 'Nobody has to claim the work they just added.',
      highlight: ['assign the creator'],
      input: {
        name: 'Assign the creator',
        enabled: true,
        trigger: { type: 'item_created' },
        conditions: [],
        actions: [{ type: 'assign', columnId: people.id, who: 'creator' }],
      },
    });
    add({
      id: 'notify_assigned',
      category: 'communicate',
      title: `When someone is assigned in ${people.title}, notify the assignees`,
      description: 'The new owner hears about it straight away.',
      highlight: [people.title],
      input: {
        name: 'Notify on assignment',
        enabled: true,
        trigger: { type: 'person_assigned', columnId: people.id },
        conditions: [],
        actions: [{ type: 'notify', to: 'assignees', message: '{{name}} was assigned' }],
      },
    });
  }

  if (status && otherLabel && people) {
    add({
      id: 'working_assign_creator',
      category: 'assign',
      title: `When status changes to ${otherLabel.name}, assign the creator`,
      description: 'Work that starts moving gets an owner automatically.',
      highlight: [otherLabel.name],
      input: {
        name: `Assign when ${otherLabel.name}`,
        enabled: true,
        trigger: { type: 'status_changed', columnId: status.id, toLabelId: otherLabel.id },
        conditions: [],
        actions: [{ type: 'assign', columnId: people.id, who: 'creator' }],
      },
    });
  }

  if (date) {
    add({
      id: 'due_next_week',
      category: 'schedule',
      title: `When an item is created, set ${date.title} to 7 days from today`,
      description: 'A sensible default deadline without anyone doing the math.',
      highlight: [date.title],
      input: {
        name: `Set ${date.title} next week`,
        enabled: true,
        trigger: { type: 'item_created' },
        conditions: [],
        actions: [{ type: 'set_value', columnId: date.id, value: { relativeDays: 7 } }],
      },
    });
    add({
      id: 'due_reminder',
      category: 'schedule',
      title: `When ${date.title} arrives 1 day before, notify the assignees`,
      description: 'A heads-up the day before the deadline, not after it.',
      highlight: [date.title],
      input: {
        name: 'Due date reminder',
        enabled: true,
        trigger: { type: 'date_arrives', columnId: date.id, offsetDays: -1, hour: 9 },
        conditions: [],
        actions: [{ type: 'notify', to: 'assignees', message: '{{name}} is due tomorrow' }],
      },
    });
    add({
      id: 'archive_after_due',
      category: 'organize',
      title: `When ${date.title} arrives 7 days after, archive the item`,
      description: 'Sweep stale items out of the board once the dust settles.',
      highlight: [date.title],
      input: {
        name: 'Archive after due date',
        enabled: true,
        trigger: { type: 'date_arrives', columnId: date.id, offsetDays: 7, hour: 9 },
        conditions: [],
        actions: [{ type: 'archive_item' }],
      },
    });
  }

  add({
    id: 'subitem_checklist',
    category: 'create',
    title: 'When an item is created, create a subitem called "Checklist"',
    description: 'Every new item starts with the same first move.',
    highlight: ['"Checklist"'],
    input: {
      name: 'Add checklist subitem',
      enabled: true,
      trigger: { type: 'item_created' },
      conditions: [],
      actions: [{ type: 'create_subitem', name: 'Checklist' }],
    },
  });

  if (firstGroup) {
    add({
      id: 'weekly_review',
      category: 'schedule',
      title: 'Every Monday at 09:00, create an item called "Weekly review"',
      description: 'The recurring work appears before the week gets away.',
      highlight: ['Monday', '09:00', '"Weekly review"'],
      input: {
        name: 'Weekly review item',
        enabled: true,
        trigger: { type: 'recurring', every: 'week', weekday: 1, hour: 9 },
        conditions: [],
        actions: [{ type: 'create_item', boardId, groupId: firstGroup.id, name: 'Weekly review' }],
      },
    });
    add({
      id: 'group_intake_notify',
      category: 'communicate',
      title: `When an item is created in ${firstGroup.title}, notify the creator`,
      description: 'A receipt for every request that lands in intake.',
      highlight: [firstGroup.title],
      input: {
        name: 'Notify on intake',
        enabled: true,
        trigger: { type: 'item_created', groupId: firstGroup.id },
        conditions: [],
        actions: [{ type: 'notify', to: 'creator', message: '{{name}} landed in intake' }],
      },
    });
  }

  add({
    id: 'subitem_created_notify',
    category: 'communicate',
    title: 'When a subitem is created, notify the creator',
    description: 'Keep an eye on the details without watching the board.',
    highlight: ['subitem'],
    input: {
      name: 'Notify on subitem',
      enabled: true,
      trigger: { type: 'subitem_created' },
      conditions: [],
      actions: [{ type: 'notify', to: 'creator', message: 'A subitem was added to {{name}}' }],
    },
  });

  add({
    id: 'webhook_created',
    category: 'create',
    title: 'When an item is created, send a webhook',
    description: 'Push new work to Slack, Zapier or your own service.',
    highlight: ['send a webhook'],
    input: {
      name: 'New item webhook',
      enabled: true,
      trigger: { type: 'item_created' },
      conditions: [],
      actions: [{ type: 'send_webhook', url: 'https://example.com/tuesday' }],
    },
  });

  if (status && otherLabel) {
    add({
      id: 'set_status_on_create',
      category: 'organize',
      title: `When an item is created, set ${status.title} to ${otherLabel.name}`,
      description: 'New work starts in the right lane every time.',
      highlight: [status.title, otherLabel.name],
      input: {
        name: 'Set starting status',
        enabled: true,
        trigger: { type: 'item_created' },
        conditions: [],
        actions: [{ type: 'set_value', columnId: status.id, value: { labelId: otherLabel.id } }],
      },
    });
  }

  return recipes;
}
