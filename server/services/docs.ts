import type { Db } from '../db/db';
import type { Doc, DocSummary, DocVersion, User } from '../../shared/types';
import { extractMentionIds } from '../../shared/mentions';
import { AppError, badRequest, notFound } from '../lib/errors';
import { assertReadWorkspace, assertWriteWorkspace } from './permissions';
import { notify } from './notifications';
import { bus } from '../realtime/bus';
import { queueIndex } from '../knowledge/indexer';

interface DocRow {
  id: number;
  workspace_id: number;
  title: string;
  content: string;
  version: number;
  created_by: number;
  updated_by: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by: number | null;
}

interface VersionRow {
  id: number;
  doc_id: number;
  title: string;
  content: string;
  user_id: number;
  created_at: string;
}

export function toDoc(row: DocRow): Doc {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    content: row.content,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toDocSummary(row: DocRow): DocSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

export function getDocRow(db: Db, id: number): DocRow {
  const row = db.prepare('SELECT * FROM docs WHERE id = ? AND archived_at IS NULL').get(id) as
    DocRow | undefined;
  if (!row) throw notFound('Doc not found');
  return row;
}

export function getDoc(db: Db, user: User, id: number): Doc {
  const row = getDocRow(db, id);
  assertReadWorkspace(db, user, row.workspace_id);
  return toDoc(row);
}

function reindexDoc(db: Db, row: DocRow): void {
  db.prepare('DELETE FROM docs_fts WHERE rowid = ?').run(row.id);
  if (row.archived_at) return;
  db.prepare('INSERT INTO docs_fts (rowid, title, content) VALUES (?, ?, ?)').run(
    row.id,
    row.title,
    row.content,
  );
}

function notifyMentions(db: Db, user: User, previous: string, next: string, doc: DocRow): void {
  const before = new Set(extractMentionIds(previous));
  for (const userId of extractMentionIds(next)) {
    if (before.has(userId) || userId === user.id) continue;
    notify(db, {
      userId,
      workspaceId: doc.workspace_id,
      kind: 'mention',
      title: `${user.name} mentioned you in ${doc.title}`,
      body: next.slice(0, 200),
      link: `/docs/${doc.id}`,
      actorId: user.id,
    });
  }
}

export function createDoc(
  db: Db,
  user: User,
  input: { workspaceId: number; title: string; content?: string },
): Doc {
  assertWriteWorkspace(db, user, input.workspaceId);
  if (input.title.trim().length > 200) throw badRequest('Title is too long');
  if ((input.content ?? '').length > 500_000) throw badRequest('Content is too long');
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO docs (workspace_id, title, content, version, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .run(input.workspaceId, input.title.trim(), input.content ?? '', user.id, user.id, now, now);
  const row = getDocRow(db, Number(info.lastInsertRowid));
  reindexDoc(db, row);
  bus.publish({ event: { type: 'workspaces.changed' } });
  return toDoc(row);
}

function snapshotVersions(db: Db, doc: DocRow, userId: number): void {
  const newest = db
    .prepare('SELECT * FROM doc_versions WHERE doc_id = ? ORDER BY id DESC LIMIT 1')
    .get(doc.id) as VersionRow | undefined;
  const latest = newest ? new Date(newest.created_at).getTime() : 0;
  if (newest && Date.now() - latest < 10 * 60 * 1000 && newest.user_id === userId) return;
  db.prepare(
    'INSERT INTO doc_versions (doc_id, title, content, user_id, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(doc.id, doc.title, doc.content, userId, new Date().toISOString());
  db.prepare(
    `DELETE FROM doc_versions WHERE doc_id = ? AND id NOT IN
      (SELECT id FROM doc_versions WHERE doc_id = ? ORDER BY id DESC LIMIT 200)`,
  ).run(doc.id, doc.id);
}

export function updateDoc(
  db: Db,
  user: User,
  id: number,
  input: { title?: string; content?: string; baseVersion: number },
): Doc {
  const row = getDocRow(db, id);
  assertWriteWorkspace(db, user, row.workspace_id);
  if (row.version !== input.baseVersion) {
    throw new AppError(409, 'conflict', 'This doc changed while you were editing', {
      doc: toDoc(row),
    });
  }
  if (input.title !== undefined && input.title.trim().length > 200)
    throw badRequest('Title is too long');
  if (input.content !== undefined && input.content.length > 500_000) {
    throw badRequest('Content is too long');
  }
  const nextTitle = input.title?.trim() ?? row.title;
  const nextContent = input.content ?? row.content;
  if (nextTitle === row.title && nextContent === row.content) return toDoc(row);
  snapshotVersions(db, row, user.id);
  db.prepare(
    'UPDATE docs SET title = ?, content = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?',
  ).run(nextTitle, nextContent, user.id, new Date().toISOString(), id);
  const updated = getDocRow(db, id);
  reindexDoc(db, updated);
  notifyMentions(db, user, row.content, nextContent, updated);
  queueIndex(db, 'doc', id);
  bus.publish({ event: { type: 'doc.changed', docId: id, version: updated.version } });
  return toDoc(updated);
}

export function archiveDoc(db: Db, user: User, id: number): void {
  const row = getDocRow(db, id);
  assertWriteWorkspace(db, user, row.workspace_id);
  db.prepare('UPDATE docs SET archived_at = ?, archived_by = ? WHERE id = ?').run(
    new Date().toISOString(),
    user.id,
    id,
  );
  reindexDoc(db, { ...row, archived_at: new Date().toISOString() });
  queueIndex(db, 'doc', id);
  bus.publish({ event: { type: 'workspaces.changed' } });
}

export function listVersions(db: Db, user: User, id: number): DocVersion[] {
  getDoc(db, user, id);
  return (
    db
      .prepare('SELECT * FROM doc_versions WHERE doc_id = ? ORDER BY id DESC LIMIT 100')
      .all(id) as VersionRow[]
  ).map((row) => ({
    id: row.id,
    docId: row.doc_id,
    title: row.title,
    userId: row.user_id,
    createdAt: row.created_at,
  }));
}

export function getVersion(db: Db, user: User, id: number, versionId: number): DocVersion {
  getDoc(db, user, id);
  const row = db
    .prepare('SELECT * FROM doc_versions WHERE id = ? AND doc_id = ?')
    .get(versionId, id) as VersionRow | undefined;
  if (!row) throw notFound('Version not found');
  return {
    id: row.id,
    docId: row.doc_id,
    title: row.title,
    userId: row.user_id,
    createdAt: row.created_at,
    content: row.content,
  };
}

export function restoreVersion(db: Db, user: User, id: number, versionId: number): Doc {
  const version = getVersion(db, user, id, versionId);
  const row = getDocRow(db, id);
  snapshotVersions(db, row, user.id);
  db.prepare(
    'UPDATE docs SET title = ?, content = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE id = ?',
  ).run(version.title, version.content ?? '', user.id, new Date().toISOString(), id);
  const updated = getDocRow(db, id);
  reindexDoc(db, updated);
  bus.publish({ event: { type: 'doc.changed', docId: id, version: updated.version } });
  return toDoc(updated);
}

export function listWorkspaceDocs(db: Db, workspaceId: number): DocSummary[] {
  return (
    db
      .prepare(
        'SELECT * FROM docs WHERE workspace_id = ? AND archived_at IS NULL ORDER BY updated_at DESC',
      )
      .all(workspaceId) as DocRow[]
  ).map(toDocSummary);
}

export function searchDocs(
  db: Db,
  user: User,
  query: string,
  limit = 10,
): { id: number; title: string; workspaceId: number; snippet: string }[] {
  const tokens = query
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (!tokens.length) return [];
  const match = tokens.map((token) => `"${token}"*`).join(' ');
  let ids: number[] = [];
  try {
    ids = (
      db.prepare('SELECT rowid FROM docs_fts WHERE docs_fts MATCH ? LIMIT 50').all(match) as {
        rowid: number;
      }[]
    ).map((row) => row.rowid);
  } catch {
    return [];
  }
  const output: { id: number; title: string; workspaceId: number; snippet: string }[] = [];
  for (const id of ids) {
    const row = db.prepare('SELECT * FROM docs WHERE id = ? AND archived_at IS NULL').get(id) as
      DocRow | undefined;
    if (!row) continue;
    try {
      assertReadWorkspace(db, user, row.workspace_id);
    } catch {
      continue;
    }
    const index = row.content.toLowerCase().indexOf(tokens[0].toLowerCase());
    output.push({
      id: row.id,
      title: row.title,
      workspaceId: row.workspace_id,
      snippet: row.content.slice(Math.max(0, index - 60), Math.max(0, index) + 140),
    });
    if (output.length >= limit) break;
  }
  return output;
}
