import type { Db } from '../db/db';
import type { BoardDraft } from '../../shared/ai';
import type { BoardFull, TemplateInfo, User, View, ViewSettings } from '../../shared/types';
import type { Action, Automation, Condition, Trigger } from '../../shared/automations';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { parseJson } from '../lib/json';
import { GAP } from '../lib/positions';
import { getBoardFull, getBoardRow } from './boards';
import { listItems, createItem } from './items';
import { createColumn } from './columns';
import { createGroup } from './groups';
import { assertBoardAccess, assertWriteWorkspace } from './permissions';
import { createAutomation } from './automations';
import { listColumnRows } from './columns';
import { createBoard, createBoardFromDraft } from './boards';

export interface BoardSnapshot {
  name: string;
  description: string;
  columns: {
    key: number;
    title: string;
    type: string;
    settings: Record<string, unknown>;
    width: number;
  }[];
  groups: { key: number; title: string; color: string }[];
  views: { name: string; type: View['type']; settings: ViewSettings }[];
  items?: {
    key: number;
    groupKey: number;
    parentKey: number | null;
    name: string;
    values: Record<string, unknown>;
  }[];
  automations?: { name: string; trigger: Trigger; conditions: Condition[]; actions: Action[] }[];
}

interface ColumnRow {
  id: number;
  board_id: number;
  title: string;
  type: string;
  settings: string;
  position: number;
  width: number;
  created_by: number | null;
}

export function snapshotBoard(
  db: Db,
  user: User,
  boardId: number,
  includeItems: boolean,
): BoardSnapshot {
  const full = getBoardFull(db, user, boardId);
  const rows = listColumnRows(db, boardId);
  const items = includeItems ? listItems(db, user, boardId) : [];
  const automations = db.prepare('SELECT * FROM automations WHERE board_id = ?').all(boardId) as {
    name: string;
    trigger: string;
    conditions: string;
    actions: string;
  }[];
  return {
    name: full.board.name,
    description: full.board.description,
    columns: rows.map((row) => ({
      key: row.id,
      title: row.title,
      type: row.type,
      settings: parseJson<Record<string, unknown>>(row.settings, {}),
      width: row.width,
    })),
    groups: full.groups.map((group) => ({
      key: group.id,
      title: group.title,
      color: group.color,
    })),
    views: full.views.map((view) => ({
      name: view.name,
      type: view.type,
      settings: view.settings,
    })),
    ...(includeItems
      ? {
          items: items.map((item) => ({
            key: item.id,
            groupKey: item.groupId,
            parentKey: item.parentId,
            name: item.name,
            values: Object.fromEntries(
              Object.entries(item.values).map(([columnId, value]) => [`c${columnId}`, value]),
            ),
          })),
        }
      : {}),
    automations: automations.map((row) => ({
      name: row.name,
      trigger: parseJson<Trigger>(row.trigger, { type: 'item_created' }),
      conditions: parseJson<Condition[]>(row.conditions, []),
      actions: parseJson<Action[]>(row.actions, []),
    })),
  };
}

function remapSettings(settings: ViewSettings, columnMap: Map<number, number>): ViewSettings {
  const next: ViewSettings = { ...settings };
  next.filters = settings.filters
    .map((filter) => ({
      ...filter,
      columnId: columnMap.get(filter.columnId) ?? 0,
    }))
    .filter((filter) => filter.columnId > 0);
  if (next.sort && typeof next.sort.columnId === 'number') {
    const mapped = columnMap.get(next.sort.columnId);
    next.sort = mapped ? { ...next.sort, columnId: mapped } : null;
  }
  next.hiddenColumnIds = settings.hiddenColumnIds
    .map((id) => columnMap.get(id) ?? 0)
    .filter((id) => id > 0);
  const remap = (id: number | null | undefined) => (id ? (columnMap.get(id) ?? null) : null);
  next.kanbanColumnId = remap(settings.kanbanColumnId);
  next.calendarColumnId = remap(settings.calendarColumnId);
  next.timelineColumnId = remap(settings.timelineColumnId);
  next.cardColumnIds = (settings.cardColumnIds ?? [])
    .map((id) => columnMap.get(id) ?? 0)
    .filter((id) => id > 0);
  return next;
}

export function instantiateSnapshot(
  db: Db,
  user: User,
  workspaceId: number,
  name: string,
  snap: BoardSnapshot,
): BoardFull {
  const created = createBoard(db, user, {
    workspaceId,
    name,
    description: snap.description,
    blank: true,
  });
  const boardId = created.board.id;
  db.prepare('DELETE FROM views WHERE board_id = ?').run(boardId);
  db.transaction(() => {
    const columnMap = new Map<number, number>();
    for (const column of snap.columns) {
      const newColumn = createColumn(db, user, boardId, {
        title: column.title,
        type: column.type as never,
        settings: column.settings,
      });
      columnMap.set(column.key, newColumn.id);
    }
    const groupMap = new Map<number, number>();
    for (const group of snap.groups) {
      const newGroup = createGroup(db, user, boardId, {
        title: group.title,
        color: group.color,
        at: 'bottom',
      });
      groupMap.set(group.key, newGroup.id);
    }
    let position = GAP;
    for (const view of snap.views) {
      db.prepare(
        'INSERT INTO views (board_id, name, type, settings, position) VALUES (?, ?, ?, ?, ?)',
      ).run(
        boardId,
        view.name,
        view.type,
        JSON.stringify(remapSettings(view.settings, columnMap)),
        position,
      );
      position += GAP;
    }
    const itemMap = new Map<number, number>();
    for (const item of snap.items ?? []) {
      if (item.parentKey !== null) continue;
      const groupId = groupMap.get(item.groupKey) ?? [...groupMap.values()][0];
      if (!groupId) continue;
      const values: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item.values)) {
        const oldId = Number(key.slice(1));
        const newId = columnMap.get(oldId);
        if (!newId) continue;
        const target = db.prepare('SELECT type FROM columns WHERE id = ?').get(newId) as
          { type: string } | undefined;
        if (!target || ['file', 'formula', 'mirror', 'time_tracking', 'ai'].includes(target.type))
          continue;
        values[String(newId)] = value;
      }
      const newItem = createItem(db, user, boardId, { groupId, name: item.name, values });
      itemMap.set(item.key, newItem.id);
    }
    for (const item of snap.items ?? []) {
      if (item.parentKey === null) continue;
      const parentId = itemMap.get(item.parentKey);
      if (!parentId) continue;
      const groupId = groupMap.get(item.groupKey) ?? [...groupMap.values()][0];
      if (!groupId) continue;
      const values: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item.values)) {
        const newColumnId = columnMap.get(Number(key.slice(1)));
        if (newColumnId) values[String(newColumnId)] = value;
      }
      const newItem = createItem(db, user, boardId, {
        groupId,
        name: item.name,
        parentId,
        values,
      });
      itemMap.set(item.key, newItem.id);
    }
    for (const automation of snap.automations ?? []) {
      try {
        const trigger = { ...automation.trigger } as Trigger;
        if ('columnId' in trigger) {
          const mapped = columnMap.get(trigger.columnId);
          if (!mapped) continue;
          (trigger as { columnId: number }).columnId = mapped;
        }
        if (trigger.type === 'item_moved_to_group') {
          const mapped = groupMap.get(trigger.groupId);
          if (!mapped) continue;
          trigger.groupId = mapped;
        }
        if (trigger.type === 'item_created' && trigger.groupId !== undefined) {
          const mapped = groupMap.get(trigger.groupId);
          if (!mapped) continue;
          trigger.groupId = mapped;
        }
        const conditions = automation.conditions
          .map((condition) => ({
            ...condition,
            columnId: columnMap.get(condition.columnId) ?? 0,
          }))
          .filter((condition) => condition.columnId > 0);
        const actions = automation.actions
          .map((action) => {
            if ('columnId' in action) {
              const mapped = columnMap.get(action.columnId);
              if (!mapped) return null;
              return { ...action, columnId: mapped } as Action;
            }
            if (action.type === 'move_to_group') {
              const mapped = groupMap.get(action.groupId);
              if (!mapped) return null;
              return { ...action, groupId: mapped } as Action;
            }
            return action;
          })
          .filter((action): action is Action => action !== null);
        if (!actions.length) continue;
        createAutomation(db, user, boardId, {
          name: automation.name,
          enabled: false,
          trigger,
          conditions,
          actions,
        });
      } catch {}
    }
  })();
  return getBoardFull(db, user, boardId);
}

const BUILTIN_DRAFTS: { slug: string; category: string; draft: BoardDraft }[] = [
  {
    slug: 'project-tracker',
    category: 'Projects',
    draft: {
      name: 'Project tracker',
      description: 'Plan, track and ship a project.',
      columns: [
        {
          title: 'Status',
          type: 'status',
          labels: [{ name: 'Planned' }, { name: 'In progress' }, { name: 'Done' }],
        },
        { title: 'Owner', type: 'people' },
        { title: 'Due date', type: 'date' },
        {
          title: 'Priority',
          type: 'dropdown',
          labels: [{ name: 'High' }, { name: 'Medium' }, { name: 'Low' }],
        },
      ],
      groups: [{ title: 'Backlog' }, { title: 'In progress' }, { title: 'Done' }],
      items: [
        {
          group: 'Backlog',
          name: 'Write project brief',
          values: { Status: 'Planned', Priority: 'High' },
        },
        { group: 'Backlog', name: 'Book kickoff', values: { Status: 'Planned' } },
        {
          group: 'In progress',
          name: 'Build first milestone',
          values: { Status: 'In progress', Priority: 'High' },
        },
        { group: 'Done', name: 'Choose tooling', values: { Status: 'Done' } },
      ],
    },
  },
  {
    slug: 'content-calendar',
    category: 'Marketing',
    draft: {
      name: 'Content calendar',
      description: 'Plan content across channels.',
      columns: [
        {
          title: 'Status',
          type: 'status',
          labels: [{ name: 'Idea' }, { name: 'Drafting' }, { name: 'Published' }],
        },
        {
          title: 'Channel',
          type: 'dropdown',
          labels: [{ name: 'Blog' }, { name: 'Email' }, { name: 'Social' }],
        },
        { title: 'Owner', type: 'people' },
        { title: 'Publish date', type: 'date' },
      ],
      groups: [{ title: 'Ideas' }, { title: 'Scheduled' }, { title: 'Published' }],
      items: [
        { group: 'Ideas', name: 'Launch blog post', values: { Status: 'Idea', Channel: 'Blog' } },
        {
          group: 'Scheduled',
          name: 'Newsletter #12',
          values: { Status: 'Drafting', Channel: 'Email' },
        },
        {
          group: 'Published',
          name: 'Teaser thread',
          values: { Status: 'Published', Channel: 'Social' },
        },
      ],
    },
  },
  {
    slug: 'bug-tracker',
    category: 'Engineering',
    draft: {
      name: 'Bug tracker',
      description: 'Triage and fix defects.',
      columns: [
        {
          title: 'Status',
          type: 'status',
          labels: [{ name: 'New' }, { name: 'Triaged' }, { name: 'Fixing' }, { name: 'Fixed' }],
        },
        {
          title: 'Severity',
          type: 'dropdown',
          labels: [{ name: 'Critical' }, { name: 'Major' }, { name: 'Minor' }],
        },
        { title: 'Owner', type: 'people' },
        { title: 'Reported', type: 'date' },
        { title: 'Steps to reproduce', type: 'long_text' },
      ],
      groups: [{ title: 'Inbox' }, { title: 'Fixing' }, { title: 'Fixed' }],
      items: [
        {
          group: 'Inbox',
          name: 'Login fails on Safari',
          values: { Status: 'New', Severity: 'Critical' },
        },
        {
          group: 'Inbox',
          name: 'Slow board load',
          values: { Status: 'Triaged', Severity: 'Major' },
        },
        {
          group: 'Fixing',
          name: 'Wrong date in CSV',
          values: { Status: 'Fixing', Severity: 'Minor' },
        },
        {
          group: 'Fixed',
          name: 'Typo on pricing page',
          values: { Status: 'Fixed', Severity: 'Minor' },
        },
      ],
    },
  },
  {
    slug: 'hiring-pipeline',
    category: 'People',
    draft: {
      name: 'Hiring pipeline',
      description: 'Track candidates through your hiring stages.',
      columns: [
        {
          title: 'Stage',
          type: 'status',
          labels: [
            { name: 'Applied' },
            { name: 'Screening' },
            { name: 'Interview' },
            { name: 'Offer' },
            { name: 'Hired' },
          ],
        },
        {
          title: 'Role',
          type: 'dropdown',
          labels: [{ name: 'Engineering' }, { name: 'Design' }, { name: 'Sales' }],
        },
        { title: 'Owner', type: 'people' },
        { title: 'Applied on', type: 'date' },
      ],
      groups: [{ title: 'Open roles' }, { title: 'Interviews' }, { title: 'Offers' }],
      items: [
        {
          group: 'Open roles',
          name: 'Senior engineer',
          values: { Stage: 'Applied', Role: 'Engineering' },
        },
        {
          group: 'Open roles',
          name: 'Product designer',
          values: { Stage: 'Screening', Role: 'Design' },
        },
        {
          group: 'Interviews',
          name: 'Account executive',
          values: { Stage: 'Interview', Role: 'Sales' },
        },
        {
          group: 'Offers',
          name: 'Staff engineer',
          values: { Stage: 'Offer', Role: 'Engineering' },
        },
      ],
    },
  },
  {
    slug: 'crm',
    category: 'Sales',
    draft: {
      name: 'CRM',
      description: 'Track deals and accounts.',
      columns: [
        {
          title: 'Stage',
          type: 'status',
          labels: [{ name: 'Lead' }, { name: 'Qualified' }, { name: 'Proposal' }, { name: 'Won' }],
        },
        { title: 'Company', type: 'text' },
        { title: 'Value', type: 'number', labels: [] },
        { title: 'Close date', type: 'date' },
        { title: 'Owner', type: 'people' },
      ],
      groups: [{ title: 'Pipeline' }, { title: 'Closing' }, { title: 'Won' }],
      items: [
        {
          group: 'Pipeline',
          name: 'Acme renewal',
          values: { Stage: 'Qualified', Company: 'Acme', Value: '12000' },
        },
        {
          group: 'Pipeline',
          name: 'Globex expansion',
          values: { Stage: 'Lead', Company: 'Globex' },
        },
        {
          group: 'Closing',
          name: 'Initech annual',
          values: { Stage: 'Proposal', Company: 'Initech', Value: '24000' },
        },
        {
          group: 'Won',
          name: 'Umbrella pilot',
          values: { Stage: 'Won', Company: 'Umbrella', Value: '8000' },
        },
      ],
    },
  },
  {
    slug: 'event-planning',
    category: 'Projects',
    draft: {
      name: 'Event planning',
      description: 'Plan an event end to end.',
      columns: [
        {
          title: 'Status',
          type: 'status',
          labels: [{ name: 'Idea' }, { name: 'Planning' }, { name: 'Confirmed' }, { name: 'Done' }],
        },
        { title: 'Event date', type: 'date' },
        { title: 'Owner', type: 'people' },
        { title: 'Budget', type: 'number' },
        { title: 'Venue', type: 'text' },
      ],
      groups: [{ title: 'To arrange' }, { title: 'Confirmed' }, { title: 'Done' }],
      items: [
        { group: 'To arrange', name: 'Book venue', values: { Status: 'Planning', Budget: '5000' } },
        { group: 'To arrange', name: 'Send invitations', values: { Status: 'Idea' } },
        {
          group: 'Confirmed',
          name: 'Catering',
          values: { Status: 'Confirmed', Budget: '2200', Venue: 'The Hall' },
        },
        { group: 'Done', name: 'Choose date', values: { Status: 'Done' } },
      ],
    },
  },
];

function builtinInfo(entry: (typeof BUILTIN_DRAFTS)[number]): TemplateInfo {
  return {
    id: `builtin:${entry.slug}`,
    name: entry.draft.name,
    description: entry.draft.description,
    category: entry.category,
    builtin: true,
    includesItems: true,
    columns: entry.draft.columns.map((column) => column.title),
    createdBy: null,
  };
}

function snapshotHasItems(snapshot: string): boolean {
  try {
    const parsed = JSON.parse(snapshot) as { items?: unknown[] };
    return Array.isArray(parsed.items) && parsed.items.length > 0;
  } catch {
    return false;
  }
}

export function listTemplates(db: Db, _user: User): TemplateInfo[] {
  const rows = db.prepare('SELECT * FROM templates ORDER BY id').all() as {
    id: number;
    name: string;
    description: string;
    category: string;
    snapshot: string;
    created_by: number;
    include_items: number;
  }[];
  return [
    ...BUILTIN_DRAFTS.map(builtinInfo),
    ...rows
      .filter(
        (row) =>
          (row.include_items === 0 && !snapshotHasItems(row.snapshot)) ||
          row.created_by === _user.id ||
          _user.role === 'owner' ||
          _user.role === 'admin',
      )
      .map((row) => ({
        id: `user:${row.id}`,
        name: row.name,
        description: row.description,
        category: row.category,
        builtin: false,
        includesItems: row.include_items === 1 || snapshotHasItems(row.snapshot),
        columns:
          parseJson<BoardSnapshot>(row.snapshot, {} as BoardSnapshot).columns?.map(
            (column) => column.title,
          ) ?? [],
        createdBy: row.created_by,
      })),
  ];
}

export function saveTemplate(
  db: Db,
  user: User,
  input: {
    boardId: number;
    name: string;
    description?: string;
    category?: string;
    includeItems: boolean;
  },
): TemplateInfo {
  const board = getBoardRow(db, input.boardId);
  assertBoardAccess(db, user, input.boardId, 'manage');
  const snapshot = snapshotBoard(db, user, input.boardId, input.includeItems);
  const info = db
    .prepare(
      `INSERT INTO templates
        (name, description, category, snapshot, include_items, source_workspace_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.description ?? '',
      input.category ?? 'Custom',
      JSON.stringify(snapshot),
      input.includeItems ? 1 : 0,
      board.workspace_id,
      user.id,
      new Date().toISOString(),
    );
  return {
    id: `user:${Number(info.lastInsertRowid)}`,
    name: input.name,
    description: input.description ?? '',
    category: input.category ?? 'Custom',
    builtin: false,
    includesItems: input.includeItems,
    columns: snapshot.columns.map((column) => column.title),
    createdBy: user.id,
  };
}

export function deleteTemplate(db: Db, user: User, id: string): void {
  if (!id.startsWith('user:')) throw badRequest('Built-in templates cannot be deleted');
  const numeric = Number(id.slice(5));
  const row = db.prepare('SELECT created_by FROM templates WHERE id = ?').get(numeric) as
    { created_by: number } | undefined;
  if (!row) throw notFound('Template not found');
  if (row.created_by !== user.id && user.role !== 'owner' && user.role !== 'admin') {
    throw forbidden();
  }
  db.prepare('DELETE FROM templates WHERE id = ?').run(numeric);
}

export function createFromTemplate(
  db: Db,
  user: User,
  templateId: string,
  workspaceId: number,
  name: string,
): BoardFull {
  assertWriteWorkspace(db, user, workspaceId);
  if (templateId.startsWith('builtin:')) {
    const slug = templateId.slice('builtin:'.length);
    const entry = BUILTIN_DRAFTS.find((candidate) => candidate.slug === slug);
    if (!entry) throw notFound('Template not found');
    return createBoardFromDraft(db, user, workspaceId, { ...entry.draft, name });
  }
  if (!templateId.startsWith('user:')) throw notFound('Template not found');
  const row = db
    .prepare('SELECT snapshot, include_items, created_by FROM templates WHERE id = ?')
    .get(Number(templateId.slice(5))) as
    { snapshot: string; include_items: number; created_by: number } | undefined;
  if (!row) throw notFound('Template not found');
  if (
    (row.include_items === 1 || snapshotHasItems(row.snapshot)) &&
    row.created_by !== user.id &&
    user.role !== 'owner' &&
    user.role !== 'admin'
  ) {
    throw notFound('Template not found');
  }
  return instantiateSnapshot(
    db,
    user,
    workspaceId,
    name,
    parseJson<BoardSnapshot>(row.snapshot, {} as BoardSnapshot),
  );
}

export function duplicateBoard(
  db: Db,
  user: User,
  boardId: number,
  name: string,
  workspaceId: number,
  includeItems: boolean,
): BoardFull {
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, user, boardId, 'manage');
  assertWriteWorkspace(db, user, workspaceId);
  const snap = snapshotBoard(db, user, boardId, includeItems);
  return instantiateSnapshot(db, user, workspaceId, name, snap);
}

export type { Automation };
