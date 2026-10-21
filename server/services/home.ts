import type { Db } from '../db/db';
import type {
  Activity,
  HomeActivity,
  HomeBoardCard,
  HomeSummary,
  MyWorkEntry,
  User,
} from '../../shared/types';
import { isDoneValue, type ColumnSettings } from '../../shared/columns';
import { describeActivity } from '../../shared/activity';
import { getOrg } from './settings';
import { addDays, zonedParts } from '../lib/timezone';
import { getMyWork } from './mywork';
import { listNotifications } from './notifications';
import { getBoardFull } from './boards';
import { listItems } from './items';
import { listBoardActivity } from './activity';
import { listUsers } from './users';
import { listFavorites } from './favorites';
import { getOnboarding } from './onboarding';
import { boardAccessMap } from './permissions';

function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

function itemDue(item: MyWorkEntry['item'], full: ReturnType<typeof getBoardFull>): string | null {
  const dateColumn = full.columns.find((column) => column.type === 'date');
  if (dateColumn) {
    const value = item.values[String(dateColumn.id)] as { date?: string } | undefined;
    if (value?.date) return value.date;
  }
  const timeline = full.columns.find((column) => column.type === 'timeline');
  if (timeline) {
    const value = item.values[String(timeline.id)] as { to?: string } | undefined;
    if (value?.to) return value.to;
  }
  return null;
}

function minimalStatus(settings: unknown): { type: 'status'; settings: ColumnSettings } {
  return { type: 'status', settings: settings as ColumnSettings };
}

export function getHome(db: Db, user: User, now: Date = new Date()): HomeSummary {
  const org = getOrg(db);
  const today = zonedParts(now, org.timezone).date;
  const monday = mondayOf(today);
  const work = getMyWork(db, user, true, now);
  const open = work.filter((entry) => !entry.isDone);

  const counts = {
    open: open.length,
    dueToday: open.filter((entry) => entry.bucket === 'today').length,
    overdue: open.filter((entry) => entry.bucket === 'overdue').length,
    doneThisWeek: 0,
  };

  const upcomingEnd = addDays(today, 3);
  const upcoming = open
    .filter((entry) => entry.dueDate && entry.dueDate > today && entry.dueDate <= upcomingEnd)
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) return String(a.dueDate).localeCompare(String(b.dueDate));
      return a.item.name.localeCompare(b.item.name);
    })
    .slice(0, 8);

  const myDay = {
    overdue: open
      .filter((entry) => entry.bucket === 'overdue')
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
      .slice(0, 8),
    today: open
      .filter((entry) => entry.bucket === 'today')
      .sort((a, b) => a.item.name.localeCompare(b.item.name))
      .slice(0, 8),
    upcoming,
  };

  const week = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today, index);
    return {
      date,
      count: open.filter((entry) => entry.dueDate === date).length,
    };
  });

  // The most recent change to a done label on each item's first status column.
  const access = boardAccessMap(db, user);
  const readableBoardIds = new Set([...access.keys()]);
  const statusColumns = db
    .prepare(
      `SELECT c.id, c.board_id, c.settings FROM columns c
       JOIN boards b ON b.id = c.board_id
       WHERE c.type = 'status' AND b.archived_at IS NULL
       ORDER BY c.board_id, c.position, c.id`,
    )
    .all() as { id: number; board_id: number; settings: string }[];
  const firstStatus = new Map<number, { id: number; settings: string }>();
  for (const column of statusColumns) {
    if (!readableBoardIds.has(column.board_id) || firstStatus.has(column.board_id)) continue;
    firstStatus.set(column.board_id, { id: column.id, settings: column.settings });
  }
  const statusByColumn = new Map(
    [...firstStatus.values()].map((column) => [
      column.id,
      minimalStatus(JSON.parse(column.settings)),
    ]),
  );
  const itemBoard = new Map(work.map((entry) => [entry.item.id, entry.board.id]));
  const itemIds = new Set(work.map((entry) => entry.item.id));
  const trendFrom = addDays(today, -14);
  const activityRows = db
    .prepare(
      `SELECT * FROM activity
       WHERE action = 'value_changed' AND item_id IS NOT NULL AND created_at >= ?
       ORDER BY id DESC`,
    )
    .all(`${trendFrom}T00:00:00.000Z`) as {
    id: number;
    board_id: number;
    item_id: number | null;
    actor_id: number | null;
    actor_kind: 'user' | 'ai' | 'system';
    action: Activity['action'];
    data: string;
    created_at: string;
  }[];

  const seenItems = new Set<number>();
  const trendCounts = new Map<string, number>();
  for (const row of activityRows) {
    if (!row.item_id || !itemIds.has(row.item_id) || seenItems.has(row.item_id)) continue;
    const boardId = itemBoard.get(row.item_id);
    const status = boardId ? firstStatus.get(boardId) : undefined;
    if (!status) continue;
    let data: { columnId?: number; toValue?: { labelId?: string } };
    try {
      data = JSON.parse(row.data);
    } catch {
      continue;
    }
    if (data.columnId !== status.id) continue;
    seenItems.add(row.item_id);
    const column = statusByColumn.get(status.id);
    if (!column || !isDoneValue(column, { labelId: data.toValue?.labelId } as never)) continue;
    const date = zonedParts(new Date(row.created_at), org.timezone).date;
    if (date < trendFrom || date > today) continue;
    trendCounts.set(date, (trendCounts.get(date) ?? 0) + 1);
    if (date >= monday) counts.doneThisWeek += 1;
  }
  const doneTrend = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, index - 13);
    return { date, count: trendCounts.get(date) ?? 0 };
  });

  const mentions = listNotifications(db, user.id)
    .notifications.filter(
      (notification) =>
        !notification.readAt &&
        (notification.kind === 'mention' || notification.kind === 'assigned'),
    )
    .slice(0, 5);

  const favorites = listFavorites(db, user);
  const favoriteBoardOrder = favorites
    .filter((favorite) => favorite.kind === 'board')
    .map((favorite) => favorite.id);
  const recentBoards = db
    .prepare(
      `SELECT board_id, max(id) AS latest FROM activity
       WHERE actor_id = ? GROUP BY board_id ORDER BY latest DESC`,
    )
    .all(user.id) as { board_id: number; latest: number }[];
  const workspaceNames = new Map<string, string>();
  const boardNames = new Map<number, { name: string; workspaceName: string; updatedAt: string }>();
  const readableBoards = db
    .prepare(
      `SELECT b.id, b.name, b.workspace_id, b.updated_at, w.name AS workspace_name
       FROM boards b JOIN workspaces w ON w.id = b.workspace_id
       WHERE b.archived_at IS NULL`,
    )
    .all() as {
    id: number;
    name: string;
    workspace_id: number;
    updated_at: string;
    workspace_name: string;
  }[];
  for (const board of readableBoards) {
    if (!readableBoardIds.has(board.id)) continue;
    workspaceNames.set(`${board.workspace_id}:${board.id}`, board.workspace_name);
    boardNames.set(board.id, {
      name: board.name,
      workspaceName: board.workspace_name,
      updatedAt: board.updated_at,
    });
  }
  const boardOrder: number[] = [];
  for (const id of favoriteBoardOrder)
    if (boardNames.has(id) && !boardOrder.includes(id)) boardOrder.push(id);
  for (const row of recentBoards)
    if (boardNames.has(row.board_id) && !boardOrder.includes(row.board_id))
      boardOrder.push(row.board_id);
  for (const id of [...boardNames.keys()].sort((a, b) =>
    (boardNames.get(b)?.updatedAt ?? '').localeCompare(boardNames.get(a)?.updatedAt ?? ''),
  )) {
    if (boardOrder.length >= 8) break;
    if (!boardOrder.includes(id)) boardOrder.push(id);
  }

  const boardCards: HomeBoardCard[] = [];
  for (const id of boardOrder.slice(0, 8)) {
    let full;
    try {
      full = getBoardFull(db, user, id);
    } catch {
      continue;
    }
    const items = listItems(db, user, id);
    const status = full.columns.find((column) => column.type === 'status');
    const labels = status?.settings.labels ?? [];
    const segments = labels
      .map((label) => ({
        label: label.name,
        color: label.color,
        count: items.filter(
          (item) =>
            (item.values[String(status!.id)] as { labelId?: string } | undefined)?.labelId ===
            label.id,
        ).length,
      }))
      .filter((segment) => segment.count > 0);
    const overdue = items.filter((item) => {
      const due = itemDue(item, full);
      return (
        due !== null &&
        due < today &&
        !(status && isDoneValue(status, item.values[String(status.id)]))
      );
    }).length;
    boardCards.push({
      id,
      name: full.board.name,
      workspaceName: workspaceNames.get(`${full.board.workspaceId}:${id}`) ?? '',
      favorite: favoriteBoardOrder.includes(id),
      total: items.length,
      overdue,
      segments,
    });
  }

  const activity: HomeActivity[] = [];
  const actorNames = new Map(listUsers(db).map((entry) => [entry.id, entry.name]));
  for (const board of [...boardNames.keys()]) {
    for (const entry of listBoardActivity(db, board, undefined, 30)) {
      if (entry.actorId === user.id) continue;
      if (entry.action === 'automation_ran' || entry.action === 'workflow_ran') continue;
      activity.push({
        ...entry,
        boardName: boardNames.get(board)?.name ?? '',
        itemName: null,
        actorName: entry.actorId ? (actorNames.get(entry.actorId) ?? null) : null,
        summary: describeActivity(entry),
      });
    }
  }
  const listedItemIds = [
    ...new Set(activity.map((entry) => entry.itemId).filter(Boolean)),
  ] as number[];
  const itemNames = new Map<number, string>(
    listedItemIds.length
      ? (
          db
            .prepare(
              `SELECT id, name FROM items WHERE id IN (${listedItemIds.map(() => '?').join(',')})`,
            )
            .all(...listedItemIds) as { id: number; name: string }[]
        ).map((row) => [row.id, row.name])
      : [],
  );
  for (const entry of activity) {
    if (entry.itemId) entry.itemName = itemNames.get(entry.itemId) ?? null;
  }
  activity.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    today,
    counts,
    myDay,
    week,
    doneTrend,
    mentions,
    boards: boardCards,
    activity: activity.slice(0, 20),
    onboarding: getOnboarding(db, user),
  };
}
