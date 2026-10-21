import type { Db } from '../db/db';
import type { FormDef, FormField, PublicForm, User } from '../../shared/types';
import { newToken } from '../lib/tokens';
import { badRequest, notFound, AppError } from '../lib/errors';
import { parseJson } from '../lib/json';
import { getBoardRow } from './boards';
import { assertReadWorkspace, assertBoardAccess } from './permissions';
import { createItem } from './items';

interface FormRow {
  id: number;
  board_id: number;
  token: string;
  title: string;
  description: string;
  group_id: number | null;
  fields: string;
  enabled: number;
  submit_message: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

const FORM_TYPES = [
  'text',
  'long_text',
  'number',
  'status',
  'dropdown',
  'date',
  'timeline',
  'checkbox',
  'link',
  'email',
  'phone',
  'rating',
];

export function toForm(db: Db, row: FormRow, appUrl: string): FormDef {
  return {
    id: row.id,
    boardId: row.board_id,
    token: row.token,
    title: row.title,
    description: row.description,
    groupId: row.group_id ?? 0,
    fields: parseJson<FormField[]>(row.fields, []),
    enabled: row.enabled === 1,
    submitMessage: row.submit_message,
    createdBy: row.created_by,
    url: `${appUrl}/f/${row.token}`,
  };
}

function getFormRow(db: Db, id: number): FormRow {
  const row = db.prepare('SELECT * FROM forms WHERE id = ?').get(id) as FormRow | undefined;
  if (!row) throw notFound('Form not found');
  return row;
}

function formRowByToken(db: Db, token: string): FormRow {
  const row = db.prepare('SELECT * FROM forms WHERE token = ?').get(token) as FormRow | undefined;
  if (!row) throw notFound('Form not found');
  return row;
}

export function listForms(db: Db, user: User, boardId: number, appUrl: string): FormDef[] {
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, user, board.id, 'view');
  return (
    db.prepare('SELECT * FROM forms WHERE board_id = ? ORDER BY id').all(boardId) as FormRow[]
  ).map((row) => toForm(db, row, appUrl));
}

export function createForm(
  db: Db,
  user: User,
  boardId: number,
  appUrl: string,
  input: { title: string },
): FormDef {
  const board = getBoardRow(db, boardId);
  assertBoardAccess(db, user, board.id, 'manage');
  const columns = db
    .prepare('SELECT * FROM columns WHERE board_id = ? ORDER BY position, id')
    .all(boardId) as { id: number; title: string; type: string }[];
  const groups = db
    .prepare('SELECT id FROM item_groups WHERE board_id = ? ORDER BY position LIMIT 1')
    .all(boardId) as { id: number }[];
  const fields: FormField[] = [
    { key: 'name', label: 'Name', required: true, help: '' },
    ...columns
      .filter((column) => FORM_TYPES.includes(column.type))
      .map((column) => ({
        key: `col:${column.id}` as const,
        label: column.title,
        required: false,
        help: '',
      })),
  ];
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO forms (board_id, token, title, description, group_id, fields, enabled, submit_message, created_by, created_at, updated_at)
       VALUES (?, ?, ?, '', ?, ?, 1, 'Thanks, your response was recorded.', ?, ?, ?)`,
    )
    .run(
      boardId,
      newToken(),
      input.title,
      groups[0]?.id ?? null,
      JSON.stringify(fields),
      user.id,
      now,
      now,
    );
  return toForm(db, getFormRow(db, Number(info.lastInsertRowid)), appUrl);
}

export function updateForm(
  db: Db,
  user: User,
  id: number,
  appUrl: string,
  patch: {
    title?: string;
    description?: string;
    groupId?: number;
    fields?: FormField[];
    enabled?: boolean;
    submitMessage?: string;
  },
): FormDef {
  const row = getFormRow(db, id);
  const board = getBoardRow(db, row.board_id);
  assertBoardAccess(db, user, board.id, 'manage');
  if (patch.groupId) {
    const group = db
      .prepare('SELECT id FROM item_groups WHERE id = ? AND board_id = ?')
      .get(patch.groupId, row.board_id);
    if (!group) throw badRequest('Unknown group');
  }
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.title !== undefined) {
    sets.push('title = ?');
    values.push(patch.title);
  }
  if (patch.description !== undefined) {
    sets.push('description = ?');
    values.push(patch.description);
  }
  if (patch.groupId !== undefined) {
    sets.push('group_id = ?');
    values.push(patch.groupId);
  }
  if (patch.fields !== undefined) {
    sets.push('fields = ?');
    values.push(JSON.stringify(patch.fields));
  }
  if (patch.enabled !== undefined) {
    sets.push('enabled = ?');
    values.push(patch.enabled ? 1 : 0);
  }
  if (patch.submitMessage !== undefined) {
    sets.push('submit_message = ?');
    values.push(patch.submitMessage);
  }
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  db.prepare(`UPDATE forms SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  return toForm(db, getFormRow(db, id), appUrl);
}

export function deleteForm(db: Db, user: User, id: number): void {
  const row = getFormRow(db, id);
  const board = getBoardRow(db, row.board_id);
  assertBoardAccess(db, user, board.id, 'manage');
  db.prepare('DELETE FROM forms WHERE id = ?').run(id);
}

function assertCreatorActive(db: Db, row: FormRow): void {
  const creator = db.prepare('SELECT is_active FROM users WHERE id = ?').get(row.created_by) as
    { is_active: number } | undefined;
  if (!creator || creator.is_active !== 1) {
    throw new AppError(410, 'gone', "This form isn't accepting responses");
  }
}

export function publicForm(db: Db, token: string): PublicForm {
  const row = formRowByToken(db, token);
  if (row.enabled !== 1) throw new AppError(410, 'gone', "This form isn't accepting responses");
  assertCreatorActive(db, row);
  const fields = parseJson<FormField[]>(row.fields, []);
  const columns = db.prepare('SELECT * FROM columns WHERE board_id = ?').all(row.board_id) as {
    id: number;
    title: string;
    type: string;
    settings: string;
  }[];
  return {
    title: row.title,
    description: row.description,
    submitMessage: row.submit_message,
    fields: fields.map((field) => {
      if (field.key === 'name') return { ...field, type: 'name' };
      const columnId = Number(field.key.slice(4));
      const column = columns.find((entry) => entry.id === columnId);
      const settings = parseJson<{
        labels?: { id: string; name: string; color: string }[];
        options?: { id: string; name: string; color: string }[];
        max?: number;
        includeTime?: boolean;
      }>(column?.settings, {});
      return {
        ...field,
        type: (column?.type as PublicForm['fields'][number]['type']) ?? 'text',
        ...(column?.type === 'status' ? { options: settings.labels } : {}),
        ...(column?.type === 'dropdown' ? { options: settings.options } : {}),
        ...(column?.type === 'rating' ? { max: settings.max ?? 5 } : {}),
        ...(column?.type === 'date' ? { includeTime: settings.includeTime } : {}),
      };
    }),
  };
}

export function submitPublicForm(
  db: Db,
  token: string,
  values: Record<string, unknown>,
  website?: string,
): { message: string } {
  const row = formRowByToken(db, token);
  if (row.enabled !== 1) throw new AppError(410, 'gone', "This form isn't accepting responses");
  assertCreatorActive(db, row);
  if (website) return { message: row.submit_message };
  const fields = parseJson<FormField[]>(row.fields, []);
  for (const field of fields) {
    const value = values[field.key];
    if (
      field.required &&
      (value === undefined || value === null || value === '' || value === false)
    ) {
      throw badRequest(`${field.label} is required`);
    }
  }
  const board = getBoardRow(db, row.board_id);
  const creator = db.prepare('SELECT * FROM users WHERE id = ?').get(row.created_by) as
    | {
        id: number;
        email: string;
        name: string;
        role: string;
        title: string;
        color: string;
        is_active: number;
        created_at: string;
        preferences: string;
      }
    | undefined;
  if (!creator) throw notFound('Form owner not found');
  const user: User = {
    id: creator.id,
    email: creator.email,
    name: creator.name,
    role: creator.role as User['role'],
    title: creator.title,
    color: creator.color,
    isActive: creator.is_active === 1,
    createdAt: creator.created_at,
    preferences: {
      theme: 'system',
      density: 'comfortable',
      sidebarCollapsed: false,
      ...JSON.parse(creator.preferences || '{}'),
    },
    isGuest: false,
    sso: false,
  };
  const groupId =
    row.group_id ??
    (
      db
        .prepare('SELECT id FROM item_groups WHERE board_id = ? ORDER BY position LIMIT 1')
        .get(row.board_id) as { id: number } | undefined
    )?.id;
  if (!groupId) throw badRequest('Board has no groups');
  const itemValues: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.key === 'name') continue;
    const columnId = Number(field.key.slice(4));
    const value = values[field.key];
    if (value === undefined || value === null || value === '') continue;
    itemValues[String(columnId)] = value;
  }
  const name = String(
    values.name ?? `Form response ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
  );
  createItem(db, user, row.board_id, { groupId, name, values: itemValues }, 'system');
  return { message: row.submit_message };
}
