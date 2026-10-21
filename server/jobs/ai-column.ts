import type { FastifyInstance } from 'fastify';
import type { AiCellValue, CellValue, ColumnSettings, ColumnType } from '../../shared/columns';
import { cellToText } from '../../shared/columns';
import type { ItemRow } from '../services/items';
import { setAiValue } from '../services/items';
import { toColumn } from '../services/boards';
import { getColumnRow } from '../services/columns';
import { listItemUpdates } from '../services/updates';
import { listUsers, getUserById } from '../services/users';
import { getSetting } from '../services/settings';
import { parseJson } from '../lib/json';
import { renderTemplate } from '../../shared/templates-text';
import type { JobHandler } from './worker';

interface TemplateColumn {
  id: number;
  title: string;
  type: string;
  settings: string;
}

function renderPrompt(
  db: FastifyInstance['db'],
  columnId: number,
  item: ItemRow,
  userNames: Map<number, string>,
): string {
  const columnRow = getColumnRow(db, columnId);
  const settings = parseJson<ColumnSettings>(columnRow.settings, {});
  const columns = db
    .prepare('SELECT id, title, type, settings FROM columns WHERE board_id = ?')
    .all(item.board_id) as TemplateColumn[];
  const board = db.prepare('SELECT name FROM boards WHERE id = ?').get(item.board_id) as
    { name: string } | undefined;
  const values: Record<string, string> = {};
  for (const target of columns) {
    const existing = db
      .prepare('SELECT value FROM item_values WHERE item_id = ? AND column_id = ?')
      .get(item.id, target.id) as { value: string } | undefined;
    if (!existing) continue;
    values[target.title] = cellToText(
      target.type as ColumnType,
      parseJson<ColumnSettings>(target.settings, {}),
      parseJson<CellValue>(existing.value, { text: '' }),
      (id) => userNames.get(id) ?? '',
    );
  }
  const updates = listItemUpdates(db, item.id)
    .slice(-10)
    .map(
      (update) =>
        `${update.authorId ? (userNames.get(update.authorId) ?? 'Someone') : 'Tuesday AI'}: ${update.body}`,
    )
    .join('\n');
  return renderTemplate(settings.prompt ?? '', {
    itemName: item.name,
    boardName: board?.name ?? '',
    values,
    updates,
  });
}

const handler: JobHandler = async (app, payload) => {
  const { columnId, itemId, userId } = payload as {
    columnId: number;
    itemId: number;
    userId: number | null;
  };
  const columnRow = app.db.prepare('SELECT * FROM columns WHERE id = ?').get(columnId) as
    { id: number; board_id: number; type: string } | undefined;
  if (!columnRow || columnRow.type !== 'ai') return;
  const item = app.db
    .prepare('SELECT * FROM items WHERE id = ? AND archived_at IS NULL')
    .get(itemId) as ItemRow | undefined;
  if (!item || item.board_id !== columnRow.board_id) return;

  const column = toColumn(getColumnRow(app.db, columnId));
  const settings = column.settings;
  const user = userId ? getUserById(app.db, userId) : null;
  if (!user || !user.isActive) return;

  const users = listUsers(app.db);
  const userNames = new Map(users.map((entry) => [entry.id, entry.name]));
  const promptText = renderPrompt(app.db, columnId, item, userNames);
  const aiSettings = app.ai.settings();
  const org = getSetting(app.db, 'org', { name: 'Tuesday' });
  const labels = settings.labels ?? [];
  const labelMode = settings.output === 'label' && labels.length > 0;

  const system = `${aiSettings.orgContext ? `About the organisation:\n${aiSettings.orgContext}\n\n` : ''}You fill one cell in a work-management table. Reply with only the cell value, no preamble, under 300 characters.${labelMode ? ` Reply with exactly one of: ${labels.map((label) => label.name).join(', ')}.` : ''}`;

  try {
    const result = await app.ai.chat(user.id, 'ai_column', {
      model: settings.model?.trim() || app.ai.modelFor('ai_column').model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: promptText },
      ],
      temperature: 0.2,
      max_tokens: 300,
    });
    const text = result.content.trim().slice(0, 300);
    if (labelMode) {
      const label = labels.find((candidate) => candidate.name.toLowerCase() === text.toLowerCase());
      if (!label) {
        const message = 'Reply did not match a label';
        setAiValue(
          app.db,
          itemId,
          columnId,
          { text: '', state: 'error', error: message, at: new Date().toISOString() },
          user.id,
        );
        throw new Error(message);
      }
      setAiValue(
        app.db,
        itemId,
        columnId,
        {
          text: label.name,
          labelId: label.id,
          state: 'done',
          at: new Date().toISOString(),
        } satisfies AiCellValue,
        user.id,
      );
    } else {
      setAiValue(
        app.db,
        itemId,
        columnId,
        { text, state: 'done', at: new Date().toISOString() },
        user.id,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI column failed';
    if (message !== 'Reply did not match a label') {
      setAiValue(
        app.db,
        itemId,
        columnId,
        { text: '', state: 'error', error: message, at: new Date().toISOString() },
        user.id,
      );
    }
    throw err;
  }
};

export const AI_COLUMN_HANDLERS: Record<string, JobHandler> = {
  ai_column_fill: handler,
};
