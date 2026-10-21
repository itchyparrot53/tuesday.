import type { Db } from '../db/db';
import type { BoardAutomationTemplate, BoardAutomationTemplateSet } from '../../shared/automations';
import { parseJson } from '../lib/json';

interface TemplateRow {
  payload: string;
  created_at: string;
}

export function getBoardAutomationTemplates(db: Db, boardId: number): BoardAutomationTemplateSet {
  const row = db
    .prepare(
      'SELECT payload, created_at FROM automation_templates WHERE board_id = ? ORDER BY id DESC LIMIT 1',
    )
    .get(boardId) as TemplateRow | undefined;
  if (!row) return { templates: [], generatedAt: null };
  const templates = parseJson<BoardAutomationTemplate[]>(row.payload, []);
  return {
    templates: Array.isArray(templates) ? templates : [],
    generatedAt: row.created_at,
  };
}

export function saveBoardAutomationTemplates(
  db: Db,
  boardId: number,
  userId: number,
  templates: BoardAutomationTemplate[],
): BoardAutomationTemplateSet {
  const createdAt = new Date().toISOString();
  const payload = JSON.stringify(templates);
  db.transaction(() => {
    db.prepare('DELETE FROM automation_templates WHERE board_id = ?').run(boardId);
    db.prepare(
      'INSERT INTO automation_templates (board_id, created_by, payload, created_at) VALUES (?, ?, ?, ?)',
    ).run(boardId, userId, payload, createdAt);
  })();
  return { templates, generatedAt: createdAt };
}
