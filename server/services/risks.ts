import type { Db } from '../db/db';
import type { RiskReport, RiskSignal, User } from '../../shared/types';
import { isDoneValue, type CellValue } from '../../shared/columns';
import { boardAccessMap } from './permissions';
import { getBoardFull } from './boards';
import { listItems } from './items';
import { getOrg } from './settings';
import { addDays, zonedParts } from '../lib/timezone';

export function getRisks(db: Db, user: User, boardIds?: number[], now = new Date()): RiskReport {
  const access = boardAccessMap(db, user);
  const wanted = boardIds?.length ? boardIds.filter((id) => access.has(id)) : [...access.keys()];
  const today = zonedParts(now, getOrg(db).timezone).date;
  const soon = addDays(today, 3);
  const week = addDays(today, 7);
  const signals: RiskSignal[] = [];
  const overload = new Map<number, { name: string; count: number; boardId: number }>();

  for (const boardId of wanted) {
    let full;
    try {
      full = getBoardFull(db, user, boardId);
    } catch {
      continue;
    }
    const status = full.columns.find((column) => column.type === 'status');
    const dateColumn = full.columns.find((column) => column.type === 'date');
    const timeline = full.columns.find((column) => column.type === 'timeline');
    const peopleColumns = full.columns.filter((column) => column.type === 'people');
    for (const item of listItems(db, user, boardId)) {
      const done = status ? isDoneValue(status, item.values[String(status.id)]) : false;
      if (done) continue;
      const due =
        (dateColumn
          ? (item.values[String(dateColumn.id)] as { date?: string } | undefined)?.date
          : undefined) ??
        (timeline
          ? (item.values[String(timeline.id)] as { to?: string } | undefined)?.to
          : undefined) ??
        null;
      if (due && due < today) {
        const days = Math.round(
          (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${due}T00:00:00Z`).getTime()) /
            86400000,
        );
        signals.push({
          kind: 'overdue',
          boardId,
          boardName: full.board.name,
          itemId: item.id,
          itemName: item.name,
          userId: null,
          userName: null,
          detail: `Overdue by ${days} day${days === 1 ? '' : 's'} (due ${due})`,
          severity: days > 7 ? 3 : 2,
        });
      }
      const assigned = peopleColumns.flatMap(
        (column) =>
          (item.values[String(column.id)] as { userIds?: number[] } | undefined)?.userIds ?? [],
      );
      if (assigned.length === 0 && due && due >= today && due <= soon) {
        signals.push({
          kind: 'unassigned_due_soon',
          boardId,
          boardName: full.board.name,
          itemId: item.id,
          itemName: item.name,
          userId: null,
          userName: null,
          detail: `Unassigned, due ${due}`,
          severity: 2,
        });
      }
      if (status) {
        const latest = db
          .prepare(
            `SELECT created_at, data FROM activity WHERE item_id = ? AND action = 'value_changed'
             ORDER BY id DESC LIMIT 1`,
          )
          .get(item.id) as { created_at: string; data: string } | undefined;
        const since = latest?.created_at ?? item.createdAt;
        if (new Date(since).getTime() < now.getTime() - 7 * 86400000) {
          signals.push({
            kind: 'stuck',
            boardId,
            boardName: full.board.name,
            itemId: item.id,
            itemName: item.name,
            userId: null,
            userName: null,
            detail: `No status change since ${since.slice(0, 10)}`,
            severity: 2,
          });
        }
      }
      if (due && due >= today && due <= week) {
        for (const userId of new Set(assigned)) {
          const entry = overload.get(userId) ?? {
            name:
              (
                db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as
                  { name: string } | undefined
              )?.name ?? 'Someone',
            count: 0,
            boardId,
          };
          entry.count += 1;
          overload.set(userId, entry);
        }
      }
    }
  }

  for (const [userId, entry] of overload) {
    if (entry.count <= 8) continue;
    signals.push({
      kind: 'overloaded',
      boardId: entry.boardId,
      boardName: '',
      itemId: null,
      itemName: null,
      userId,
      userName: entry.name,
      detail: `${entry.count} open items due in the next 7 days`,
      severity: 3,
    });
  }

  signals.sort((a, b) => b.severity - a.severity || a.detail.localeCompare(b.detail));
  const counts: RiskReport['counts'] = {
    overdue: 0,
    stuck: 0,
    unassigned_due_soon: 0,
    overloaded: 0,
  };
  for (const signal of signals) counts[signal.kind] += 1;
  return {
    generatedAt: new Date().toISOString(),
    signals: signals.slice(0, 100),
    counts,
  };
}

export function riskLines(report: RiskReport): string[] {
  return report.signals.map((signal) =>
    signal.itemId
      ? `[[item:${signal.itemId}]] ${signal.kind.replace(/_/g, ' ')}: ${signal.itemName} on ${signal.boardName} — ${signal.detail}`
      : `overloaded: ${signal.userName} — ${signal.detail}`,
  );
}
