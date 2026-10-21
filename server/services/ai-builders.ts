import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dashboardInputSchema, type Widget } from '../../shared/dashboards';
import type { User, ViewSettings } from '../../shared/types';
import { assertBoardAccess, assertWriteWorkspace, boardAccessMap } from './permissions';
import { getBoardFull, getBoardRow } from './boards';
import { generateStructured } from '../ai/structured';
import { listWorkspacesForUser } from './workspaces';

const draftSchema = dashboardInputSchema.required({ widgets: true });

export async function dashboardDraft(
  app: FastifyInstance,
  user: User,
  workspaceId: number,
  prompt: string,
  boardIds?: number[],
): Promise<z.infer<typeof draftSchema>> {
  assertWriteWorkspace(app.db, user, workspaceId);
  const access = boardAccessMap(app.db, user);
  const workspace = listWorkspacesForUser(app.db, user).find((entry) => entry.id === workspaceId);
  const readable = (workspace?.boards ?? [])
    .map((board) => board.id)
    .filter((id) => access.has(id));
  const chosen = (
    boardIds?.length ? boardIds.filter((id) => readable.includes(id)) : readable
  ).slice(0, 20);
  if (!chosen.length) throw new Error('No readable boards in this workspace');
  const boards = chosen.map((id) => {
    const full = getBoardFull(app.db, user, id);
    return {
      id,
      name: full.board.name,
      columns: full.columns.map((column) => ({
        title: column.title,
        type: column.type,
        labels: column.settings.labels?.map((label) => label.name),
        options: column.settings.options?.map((option) => option.name),
      })),
    };
  });
  const draft = await generateStructured(app, {
    userId: user.id,
    feature: 'dashboard_gen',
    system:
      'You design dashboards. Reply with JSON {"name":"...","boardIds":[...],"widgets":[{"id":"...","type":"...","title":"...","w":6,"h":2,"config":{}}]} using 4-8 widgets. ' +
      'Widget types: number, chart, battery, workload, items, note, ai_insight, risk. Layout is a 12-column grid; w is 3/4/6/8/12 and h is 1-4; widths in one row must total at most 12. ' +
      `Boards: ${JSON.stringify(boards)}.`,
    user: prompt,
    schema: draftSchema,
    validate: (value) => {
      if (!value.boardIds.every((id) => chosen.includes(id))) return 'Board outside the workspace';
      if (new Set(value.widgets.map((widget) => widget.id)).size !== value.widgets.length) {
        return 'Widget ids must be unique';
      }
      const titles = new Set(
        boards.flatMap((board) => board.columns.map((column) => column.title)),
      );
      for (const widget of value.widgets) {
        const config = widget.config;
        for (const title of [
          config.valueColumnTitle,
          config.groupByColumnTitle,
          config.sortColumnTitle,
        ]) {
          if (title && !titles.has(title)) return `Unknown column ${title}`;
        }
      }
      let width = 0;
      for (const widget of value.widgets) {
        if (width + widget.w > 12) width = 0;
        width += widget.w;
      }
      return null;
    },
  });
  return draft;
}

const viewSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(['table', 'kanban', 'calendar', 'timeline']),
  settings: z.record(z.unknown()),
});

export async function viewDraft(
  app: FastifyInstance,
  user: User,
  boardId: number,
  prompt: string,
): Promise<{
  name: string;
  type: 'table' | 'kanban' | 'calendar' | 'timeline';
  settings: ViewSettings;
}> {
  assertBoardAccess(app.db, user, boardId, 'manage');
  const full = getBoardFull(app.db, user, boardId);
  const draft = await generateStructured(app, {
    userId: user.id,
    feature: 'view_gen',
    system:
      'You design board views. Reply with JSON {"name":"...","type":"table|kanban|calendar|timeline","settings":{"filters":[],"sort":null,"search":"","personUserId":null,"hiddenColumnIds":[],"kanbanColumnId":null,"calendarColumnId":null,"timelineColumnId":null}}. ' +
      `Columns: ${JSON.stringify(full.columns.map((column) => ({ id: column.id, title: column.title, type: column.type })))}.`,
    user: prompt,
    schema: viewSchema,
    validate: (value) => {
      const settings = value.settings as Partial<ViewSettings>;
      const ids = new Set(full.columns.map((column) => column.id));
      if (settings.kanbanColumnId) {
        const column = full.columns.find((entry) => entry.id === settings.kanbanColumnId);
        if (!column || !['status', 'dropdown'].includes(column.type))
          return 'Kanban column must be status or dropdown';
      }
      if (settings.calendarColumnId) {
        const column = full.columns.find((entry) => entry.id === settings.calendarColumnId);
        if (!column || column.type !== 'date') return 'Calendar column must be date';
      }
      if (settings.timelineColumnId) {
        const column = full.columns.find((entry) => entry.id === settings.timelineColumnId);
        if (!column || column.type !== 'timeline') return 'Timeline column must be timeline';
      }
      for (const id of settings.hiddenColumnIds ?? [])
        if (!ids.has(id)) return 'Unknown hidden column';
      return null;
    },
  });
  return {
    name: draft.name,
    type: draft.type,
    settings: draft.settings as unknown as ViewSettings,
  };
}

export async function previewWidgets(
  app: FastifyInstance,
  user: User,
  boardIds: number[],
  widgets: Widget[],
) {
  const access = boardAccessMap(app.db, user);
  const readable = boardIds.filter((id) => access.has(id));
  const dashboard = {
    id: 0,
    workspaceId: 0,
    name: 'Preview',
    boardIds: readable,
    widgets,
    createdBy: user.id,
    createdAt: '',
    updatedAt: '',
  };
  const { computeWidget } = await import('./dashboards');
  return widgets.map((widget) => {
    if (widget.type === 'ai_insight') {
      return {
        kind: 'ai_insight' as const,
        text: 'Insight appears after saving.',
        generatedAt: null,
      };
    }
    try {
      return computeWidget(app.db, user, dashboard, widget);
    } catch {
      return { kind: 'note' as const, text: 'This widget needs attention.' };
    }
  });
}
