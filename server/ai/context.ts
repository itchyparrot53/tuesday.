import type { FastifyInstance } from 'fastify';
import type { AiContext } from '../../shared/ai';
import { cellToText, type CellValue } from '../../shared/columns';
import type { Column, Item, User } from '../../shared/types';
import { getBoardFull } from '../services/boards';
import { listItems } from '../services/items';
import { getItem } from '../services/items';
import { listItemUpdates } from '../services/updates';
import { getDoc } from '../services/docs';
import { listUsers } from '../services/users';

const BUDGET = 24_000;

function readableValues(item: Item, columns: Column[], names: Map<number, string>): string {
  return columns
    .map((column) => {
      const text = cellToText(
        column.type,
        column.settings,
        item.values[String(column.id)] as CellValue | undefined,
        (id) => names.get(id) ?? '',
      );
      return text ? `${column.title}: ${text}` : '';
    })
    .filter(Boolean)
    .join('; ');
}

export function buildAttachedContext(app: FastifyInstance, user: User, context: AiContext): string {
  const entries: string[] = [];
  const users = listUsers(app.db);
  const names = new Map(users.map((entry) => [entry.id, entry.name]));

  for (const boardId of context.boardIds) {
    try {
      const full = getBoardFull(app.db, user, boardId);
      const items = listItems(app.db, user, boardId).slice(0, 40);
      const columns = full.columns
        .map((column) => {
          const labels = column.settings.labels?.map((label) => label.name).join(', ');
          return `${column.title} (${column.type})${labels ? ` [${labels}]` : ''}`;
        })
        .join(', ');
      entries.push(
        [
          `Board: ${full.board.name}`,
          `Columns: ${columns}`,
          `Groups: ${full.groups.map((group) => group.title).join(', ')}`,
          `Items (up to 40):`,
          ...items.map(
            (item) =>
              `- ${item.name} (${full.groups.find((group) => group.id === item.groupId)?.title ?? ''}): ${readableValues(item, full.columns, names)}`,
          ),
        ].join('\n'),
      );
    } catch {
      // No longer readable: skip silently.
    }
  }

  for (const itemId of context.itemIds) {
    try {
      const detail = getItem(app.db, user, itemId);
      const full = getBoardFull(app.db, user, detail.board.id);
      const updates = listItemUpdates(app.db, itemId)
        .slice(-10)
        .map(
          (update) =>
            `${update.authorId ? (names.get(update.authorId) ?? 'Someone') : 'Tuesday AI'}: ${update.body}`,
        );
      entries.push(
        [
          `Item: ${detail.item.name}`,
          `Board: ${detail.board.name}`,
          `Group: ${full.groups.find((group) => group.id === detail.item.groupId)?.title ?? ''}`,
          `Values: ${readableValues(detail.item, full.columns, names)}`,
          updates.length ? `Recent updates:\n${updates.join('\n')}` : 'Recent updates: none',
        ].join('\n'),
      );
    } catch {
      // No longer readable: skip silently.
    }
  }

  for (const docId of context.docIds) {
    try {
      const doc = getDoc(app.db, user, docId);
      entries.push(`Doc: ${doc.title}\n${doc.content.slice(0, 4_000)}`);
    } catch {
      // No longer readable: skip silently.
    }
  }

  if (!entries.length) return '';
  const perEntry = Math.floor(BUDGET / entries.length);
  return entries
    .map((entry) => entry.slice(0, perEntry))
    .join('\n\n---\n\n')
    .slice(0, BUDGET);
}
