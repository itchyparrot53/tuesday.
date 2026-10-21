import type { Db } from '../db/db';
import type { Item, MyWorkBucket, MyWorkEntry, User } from '../../shared/types';
import { isDoneValue } from '../../shared/columns';
import { getOrg } from './settings';
import { zonedParts, addDays } from '../lib/timezone';
import { boardAccessMap } from './permissions';
import { listItems } from './items';
import { getBoardFull } from './boards';

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function bucketFor(dueDate: string | null, today: string): MyWorkBucket {
  if (!dueDate) return 'no_date';
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  const daysToSunday = (7 - weekdayOf(today)) % 7;
  const endThisWeek = addDays(today, daysToSunday);
  if (dueDate <= endThisWeek) return 'this_week';
  const endNextWeek = addDays(today, daysToSunday + 7);
  if (dueDate <= endNextWeek) return 'next_week';
  return 'later';
}

export function getMyWork(
  db: Db,
  user: User,
  includeDone = false,
  now: Date = new Date(),
): MyWorkEntry[] {
  const org = getOrg(db);
  const today = zonedParts(now, org.timezone).date;
  const access = boardAccessMap(db, user);
  const boards = (
    db
      .prepare('SELECT id, workspace_id, name FROM boards WHERE archived_at IS NULL ORDER BY id')
      .all() as { id: number; workspace_id: number; name: string }[]
  ).filter((board) => access.has(board.id));

  const entries: MyWorkEntry[] = [];
  for (const board of boards) {
    let full;
    try {
      full = getBoardFull(db, user, board.id);
    } catch {
      continue;
    }
    const peopleColumns = full.columns.filter((column) => column.type === 'people');
    if (!peopleColumns.length) continue;
    const dateColumns = full.columns.filter((column) => column.type === 'date');
    const timelineColumns = full.columns.filter((column) => column.type === 'timeline');
    const statusColumns = full.columns.filter((column) => column.type === 'status');

    for (const item of listItems(db, user, board.id)) {
      const assigned = peopleColumns.some((column) => {
        const value = item.values[String(column.id)] as { userIds?: number[] } | undefined;
        return (value?.userIds ?? []).includes(user.id);
      });
      if (!assigned) continue;

      const dateValue = dateColumns
        .map((column) => item.values[String(column.id)] as { date?: string } | undefined)
        .find((value) => value?.date);
      const timelineValue = timelineColumns
        .map((column) => item.values[String(column.id)] as { to?: string } | undefined)
        .find((value) => value?.to);
      const dueDate = dateValue?.date ?? timelineValue?.to ?? null;
      const statusColumn = statusColumns[0] ?? null;
      const isDone = statusColumn
        ? isDoneValue(statusColumn, item.values[String(statusColumn.id)])
        : false;
      if (isDone && !includeDone) continue;

      entries.push({
        item,
        board: { id: board.id, name: board.name, workspaceId: board.workspace_id },
        groupTitle: full.groups.find((group) => group.id === item.groupId)?.title ?? '',
        dueDate,
        statusColumnId: statusColumn?.id ?? null,
        bucket: bucketFor(dueDate, today),
        isDone,
      });
    }
  }

  const order: MyWorkBucket[] = ['overdue', 'today', 'this_week', 'next_week', 'later', 'no_date'];
  entries.sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    return a.item.name.localeCompare(b.item.name);
  });
  entries.sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket));
  return entries;
}
