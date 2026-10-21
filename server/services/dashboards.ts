import type { Db } from '../db/db';
import { randomUUID } from 'node:crypto';
import type { Dashboard, Widget, WidgetData } from '../../shared/dashboards';
import type { BoardFull, Item, User } from '../../shared/types';
import { cellToText, type CellValue } from '../../shared/columns';
import { matchFilter } from '../../shared/filters';
import { badRequest, notFound } from '../lib/errors';
import { parseJson } from '../lib/json';
import { getBoardFull, getBoardRow, toColumn } from './boards';
import { listItems } from './items';
import {
  boardAccess,
  canReadWorkspace,
  assertReadWorkspace,
  assertWriteWorkspace,
} from './permissions';
import { bus } from '../realtime/bus';
import { listUsers } from './users';
import { zonedParts } from '../lib/timezone';
import { getOrg } from './settings';
import { listColumnRows } from './columns';
import { getRisks } from './risks';

interface DashboardRow {
  id: number;
  workspace_id: number;
  name: string;
  board_ids: string;
  widgets: string;
  insight_cache: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by: number | null;
}

export function toDashboard(row: DashboardRow): Dashboard {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    boardIds: parseJson<number[]>(row.board_ids, []),
    widgets: parseJson<Widget[]>(row.widgets, []),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getDashboardRow(db: Db, id: number): DashboardRow {
  const row = db
    .prepare('SELECT * FROM dashboards WHERE id = ? AND archived_at IS NULL')
    .get(id) as DashboardRow | undefined;
  if (!row) throw notFound('Dashboard not found');
  return row;
}

export function getDashboard(db: Db, user: User, id: number): Dashboard {
  const row = getDashboardRow(db, id);
  assertReadWorkspace(db, user, row.workspace_id);
  return toDashboard(row);
}

function validateBoards(db: Db, user: User, workspaceId: number, boardIds: number[]): void {
  for (const boardId of boardIds) {
    const board = getBoardRow(db, boardId);
    if (board.workspace_id !== workspaceId)
      throw badRequest('All boards must be in the same workspace');
    if (!canReadWorkspace(db, user, workspaceId)) throw notFound('Workspace not found');
  }
}

function starterWidgets(db: Db, user: User, boardIds: number[]): Widget[] {
  const board = getBoardFull(db, user, boardIds[0]);
  const status = board.columns.find((column) => column.type === 'status') ?? board.columns[0];
  const date = board.columns.find((column) => column.type === 'date');
  const today = zonedParts(new Date(), getOrg(db).timezone).date;
  const widgets: Widget[] = [
    {
      id: randomUUID().slice(0, 8),
      type: 'battery',
      title: 'Status breakdown',
      w: 6,
      h: 2,
      config: { groupByColumnTitle: status?.title },
    },
    {
      id: randomUUID().slice(0, 8),
      type: 'chart',
      title: 'Items by status',
      w: 6,
      h: 2,
      config: { groupBy: 'status', groupByColumnTitle: status?.title, chartKind: 'bar' },
    },
    {
      id: randomUUID().slice(0, 8),
      type: 'items',
      title: 'Overdue',
      w: 12,
      h: 2,
      config: {
        limit: 10,
        ...(date
          ? { filters: [{ columnTitle: date.title, op: 'lt' as const, value: today }] }
          : {}),
      },
    },
  ];
  return widgets;
}

export function createDashboard(
  db: Db,
  user: User,
  workspaceId: number,
  name: string,
  boardIds: number[],
): Dashboard {
  assertWriteWorkspace(db, user, workspaceId);
  validateBoards(db, user, workspaceId, boardIds);
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO dashboards (workspace_id, name, board_ids, widgets, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      workspaceId,
      name,
      JSON.stringify(boardIds),
      JSON.stringify(starterWidgets(db, user, boardIds)),
      user.id,
      now,
      now,
    );
  bus.publish({ event: { type: 'workspaces.changed' } });
  return toDashboard(getDashboardRow(db, Number(info.lastInsertRowid)));
}

export function updateDashboard(
  db: Db,
  user: User,
  id: number,
  patch: { name?: string; boardIds?: number[]; widgets?: Widget[] },
): Dashboard {
  const row = getDashboardRow(db, id);
  assertWriteWorkspace(db, user, row.workspace_id);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    values.push(patch.name);
  }
  if (patch.boardIds !== undefined) {
    validateBoards(db, user, row.workspace_id, patch.boardIds);
    sets.push('board_ids = ?');
    values.push(JSON.stringify(patch.boardIds));
  }
  if (patch.widgets !== undefined) {
    sets.push('widgets = ?');
    values.push(JSON.stringify(patch.widgets));
  }
  sets.push('updated_at = ?');
  values.push(new Date().toISOString());
  db.prepare(`UPDATE dashboards SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  bus.publish({ event: { type: 'dashboard.changed', dashboardId: id } });
  bus.publish({ event: { type: 'workspaces.changed' } });
  return toDashboard(getDashboardRow(db, id));
}

export function archiveDashboard(db: Db, user: User, id: number): void {
  const row = getDashboardRow(db, id);
  assertWriteWorkspace(db, user, row.workspace_id);
  db.prepare('UPDATE dashboards SET archived_at = ?, archived_by = ? WHERE id = ?').run(
    new Date().toISOString(),
    user.id,
    id,
  );
  bus.publish({ event: { type: 'dashboard.changed', dashboardId: id } });
  bus.publish({ event: { type: 'workspaces.changed' } });
}

interface FlatItem {
  item: Item;
  board: BoardFull;
  boardName: string;
  groupTitle: string;
}

export function computeWidget(
  db: Db,
  user: User,
  dashboard: Dashboard,
  widget: Widget,
  now: Date = new Date(),
): WidgetData {
  const users = listUsers(db);
  const nameMap = new Map(users.map((entry) => [entry.id, entry.name]));
  const itemName = (id: number) =>
    (db.prepare('SELECT name FROM items WHERE id = ?').get(id) as { name: string } | undefined)
      ?.name ?? `#${id}`;
  if (widget.type === 'note') return { kind: 'note', text: widget.config.text ?? '' };
  if (widget.type === 'risk') {
    return { kind: 'risk', report: getRisks(db, user, widget.config.boardIds, now) };
  }
  if (widget.type === 'ai_insight') {
    const row = getDashboardRow(db, dashboard.id);
    const cache = parseJson<Record<string, { text: string; generatedAt: string }>>(
      row.insight_cache,
      {},
    );
    const hit = cache[widget.id];
    return { kind: 'ai_insight', text: hit?.text ?? null, generatedAt: hit?.generatedAt ?? null };
  }

  const selected = widget.config.boardIds?.length
    ? dashboard.boardIds.filter((id) => widget.config.boardIds!.includes(id))
    : dashboard.boardIds;
  const rows: FlatItem[] = [];
  const boardFulls: BoardFull[] = [];
  for (const boardId of selected) {
    const boardRow = getBoardRow(db, boardId);
    if (boardAccess(db, user, boardId) === 'none') continue;
    let full: BoardFull;
    try {
      full = getBoardFull(db, user, boardId);
    } catch {
      continue;
    }
    boardFulls.push(full);
    for (const item of listItems(db, user, boardId)) {
      if (item.parentId !== null) continue;
      let keep = true;
      for (const filter of widget.config.filters ?? []) {
        const column = full.columns.find(
          (entry) => entry.title.toLowerCase() === filter.columnTitle.toLowerCase(),
        );
        if (!column) continue;
        if (
          !matchFilter(item, column, filter, { userName: (id) => nameMap.get(id) ?? '', itemName })
        ) {
          keep = false;
          break;
        }
      }
      if (!keep) continue;
      rows.push({
        item,
        board: full,
        boardName: full.board.name,
        groupTitle: full.groups.find((group) => group.id === item.groupId)?.title ?? '',
      });
    }
  }

  if (widget.type === 'number') {
    const metric = widget.config.metric ?? 'count';
    const valueColumnTitle = widget.config.valueColumnTitle;
    if (metric === 'count' || !valueColumnTitle) {
      return { kind: 'number', value: rows.length, label: 'Items' };
    }
    let total = 0;
    let counted = 0;
    for (const row of rows) {
      const column = row.board.columns.find(
        (entry) => entry.title.toLowerCase() === valueColumnTitle.toLowerCase(),
      );
      if (!column) continue;
      const raw = cellToText(
        column.type,
        column.settings,
        row.item.values[String(column.id)] as CellValue | undefined,
        (id) => nameMap.get(id) ?? '',
      );
      const value = Number(raw.replace(/[^0-9.-]/g, ''));
      if (Number.isFinite(value)) {
        total += value;
        counted++;
      }
    }
    return {
      kind: 'number',
      value: metric === 'avg' ? (counted ? total / counted : 0) : total,
      label: valueColumnTitle,
    };
  }

  if (widget.type === 'chart') {
    const groupBy = widget.config.groupBy ?? 'status';
    const series = new Map<string, { value: number; color: string | null }>();
    for (const row of rows) {
      let label = 'None';
      let color: string | null = null;
      if (groupBy === 'board') {
        label = row.boardName;
      } else if (groupBy === 'group') {
        label = row.groupTitle;
        color = row.board.groups.find((group) => group.id === row.item.groupId)?.color ?? null;
      } else if (groupBy === 'people') {
        const column =
          row.board.columns.find(
            (entry) =>
              entry.title.toLowerCase() === (widget.config.groupByColumnTitle ?? '').toLowerCase(),
          ) ?? row.board.columns.find((entry) => entry.type === 'people');
        const ids = ((row.item.values[String(column?.id)] as { userIds?: number[] } | undefined)
          ?.userIds ?? []) as number[];
        for (const id of ids) {
          const userEntry = users.find((entry) => entry.id === id);
          const current = series.get(userEntry?.name ?? String(id)) ?? {
            value: 0,
            color: userEntry?.color ?? null,
          };
          current.value++;
          series.set(userEntry?.name ?? String(id), current);
        }
        continue;
      } else if (groupBy === 'month') {
        const column =
          row.board.columns.find(
            (entry) =>
              entry.title.toLowerCase() === (widget.config.groupByColumnTitle ?? '').toLowerCase(),
          ) ??
          row.board.columns.find((entry) => entry.type === 'date' || entry.type === 'timeline');
        const value = row.item.values[String(column?.id)] as
          { date?: string; from?: string } | undefined;
        label = (value?.date ?? value?.from ?? '').slice(0, 7) || 'None';
      } else if (groupBy === 'dropdown') {
        const column =
          row.board.columns.find(
            (entry) =>
              entry.title.toLowerCase() === (widget.config.groupByColumnTitle ?? '').toLowerCase(),
          ) ?? row.board.columns.find((entry) => entry.type === 'dropdown');
        const ids = ((row.item.values[String(column?.id)] as { optionIds?: string[] } | undefined)
          ?.optionIds ?? []) as string[];
        const labelEntry = column?.settings.options?.find((entry) => entry.id === ids[0]);
        label = labelEntry?.name ?? 'None';
        color = labelEntry?.color ?? null;
      } else {
        const column =
          row.board.columns.find(
            (entry) =>
              entry.title.toLowerCase() === (widget.config.groupByColumnTitle ?? '').toLowerCase(),
          ) ?? row.board.columns.find((entry) => entry.type === 'status');
        const labelId = (row.item.values[String(column?.id)] as { labelId?: string } | undefined)
          ?.labelId;
        const labelEntry = column?.settings.labels?.find((entry) => entry.id === labelId);
        label = labelEntry?.name ?? 'None';
        color = labelEntry?.color ?? null;
      }
      const current = series.get(label) ?? { value: 0, color };
      current.value++;
      series.set(label, current);
    }
    return {
      kind: 'series',
      series: [...series.entries()]
        .map(([label, entry]) => ({ label, value: entry.value, color: entry.color }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    };
  }

  if (widget.type === 'battery') {
    const column =
      boardFulls[0]?.columns.find(
        (entry) =>
          entry.title.toLowerCase() === (widget.config.groupByColumnTitle ?? '').toLowerCase(),
      ) ?? boardFulls[0]?.columns.find((entry) => entry.type === 'status');
    const labels = column?.settings.labels ?? [];
    const segments = labels.map((label) => ({
      label: label.name,
      color: label.color,
      count: rows.filter((row) => {
        const value = row.item.values[String(column?.id)] as { labelId?: string } | undefined;
        return value?.labelId === label.id;
      }).length,
    }));
    return { kind: 'battery', total: rows.length, segments };
  }

  if (widget.type === 'workload') {
    const column =
      boardFulls[0]?.columns.find(
        (entry) =>
          entry.title.toLowerCase() === (widget.config.groupByColumnTitle ?? '').toLowerCase(),
      ) ?? boardFulls[0]?.columns.find((entry) => entry.type === 'people');
    const numeric = widget.config.valueColumnTitle
      ? boardFulls[0]?.columns.find(
          (entry) => entry.title.toLowerCase() === widget.config.valueColumnTitle!.toLowerCase(),
        )
      : undefined;
    const counts = new Map<number, number>();
    for (const row of rows) {
      const ids = ((row.item.values[String(column?.id)] as { userIds?: number[] } | undefined)
        ?.userIds ?? []) as number[];
      for (const id of ids) {
        const value = numeric
          ? Number(
              cellToText(
                numeric.type,
                numeric.settings,
                row.item.values[String(numeric.id)] as CellValue | undefined,
                (uid) => nameMap.get(uid) ?? '',
              ).replace(/[^0-9.-]/g, ''),
            ) || 0
          : 1;
        counts.set(id, (counts.get(id) ?? 0) + value);
      }
    }
    return {
      kind: 'workload',
      capacity: widget.config.capacity ?? null,
      rows: users
        .filter((entry) => entry.isActive)
        .map((entry) => ({
          userId: entry.id,
          name: entry.name,
          color: entry.color,
          value: counts.get(entry.id) ?? 0,
        })),
    };
  }

  // items
  let list = [...rows];
  if (widget.config.sortColumnTitle) {
    list.sort((a, b) => {
      const columnA = a.board.columns.find(
        (entry) => entry.title.toLowerCase() === widget.config.sortColumnTitle!.toLowerCase(),
      );
      const columnB = b.board.columns.find(
        (entry) => entry.title.toLowerCase() === widget.config.sortColumnTitle!.toLowerCase(),
      );
      const av = columnA
        ? cellToText(
            columnA.type,
            columnA.settings,
            a.item.values[String(columnA.id)] as CellValue | undefined,
            (id) => nameMap.get(id) ?? '',
          )
        : '';
      const bv = columnB
        ? cellToText(
            columnB.type,
            columnB.settings,
            b.item.values[String(columnB.id)] as CellValue | undefined,
            (id) => nameMap.get(id) ?? '',
          )
        : '';
      return av.localeCompare(bv);
    });
  }
  return {
    kind: 'items',
    items: list.slice(0, widget.config.limit ?? 10).map((row) => {
      const values: Record<string, string> = {};
      for (const column of row.board.columns) {
        const text = cellToText(
          column.type,
          column.settings,
          row.item.values[String(column.id)] as CellValue | undefined,
          (id) => nameMap.get(id) ?? '',
        );
        if (text) values[column.title] = text;
      }
      return {
        id: row.item.id,
        name: row.item.name,
        boardId: row.board.board.id,
        boardName: row.boardName,
        groupTitle: row.groupTitle,
        values,
      };
    }),
  };
}

export function dashboardBoardsForCache(db: Db, id: number): number[] {
  return toDashboard(getDashboardRow(db, id)).boardIds;
}

export { toColumn, listColumnRows };
