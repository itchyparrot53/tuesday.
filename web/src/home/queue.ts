import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { BoardFull, Column, HomeSummary, MyWorkEntry } from '../../../shared/types';
import { isDoneValue, type CellValue, type Label } from '../../../shared/columns';

export type QueueEntry = MyWorkEntry;
export type QueueBoard = BoardFull;

const BUCKET_RANK: Record<MyWorkEntry['bucket'], number> = {
  overdue: 0,
  today: 1,
  this_week: 2,
  next_week: 4,
  later: 5,
  no_date: 6,
};

/** One ranked queue: overdue first, then today, then the next three days. */
export function buildQueue(summary: HomeSummary): QueueEntry[] {
  const seen = new Set<number>();
  const all: QueueEntry[] = [];
  for (const entry of [
    ...summary.myDay.overdue,
    ...summary.myDay.today,
    ...summary.myDay.upcoming,
  ]) {
    if (seen.has(entry.item.id)) continue;
    seen.add(entry.item.id);
    all.push(entry);
  }
  return all.sort((a, b) => {
    const rank = BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket];
    if (rank !== 0) return rank;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) {
      return a.dueDate.localeCompare(b.dueDate);
    }
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return a.item.name.localeCompare(b.item.name);
  });
}

export function lateDays(entry: QueueEntry, today: string): number {
  if (!entry.dueDate || entry.dueDate >= today) return 0;
  return differenceInCalendarDays(parseISO(today), parseISO(entry.dueDate));
}

export function dueLabel(entry: QueueEntry, today: string): string {
  if (!entry.dueDate) return 'No date';
  const late = lateDays(entry, today);
  if (late > 0) return late === 1 ? '1 day late' : `${late} days late`;
  if (entry.dueDate === today) return 'Today';
  return format(parseISO(entry.dueDate), 'EEE d');
}

export function dueDetail(entry: QueueEntry, today: string): string {
  if (!entry.dueDate) return 'No due date';
  return format(parseISO(entry.dueDate), 'EEEE d MMMM');
}

export function dueSentence(entry: QueueEntry, today: string): string {
  if (!entry.dueDate) return 'No due date';
  const late = lateDays(entry, today);
  if (late > 0) return late === 1 ? 'Overdue by one day' : `Overdue by ${late} days`;
  if (entry.dueDate === today) return 'Due today';
  return `Due ${format(parseISO(entry.dueDate), 'EEEE')}`;
}

export interface StatusInfo {
  column: Column | null;
  label: Label | null;
  doneLabel: Label | null;
}

export function statusInfo(board: QueueBoard | undefined, entry: QueueEntry): StatusInfo {
  const column =
    board?.columns.find(
      (candidate) => candidate.type === 'status' && candidate.id === entry.statusColumnId,
    ) ??
    board?.columns.find((candidate) => candidate.type === 'status') ??
    null;
  if (!column) return { column: null, label: null, doneLabel: null };
  const value = entry.item.values[String(column.id)] as { labelId?: string } | undefined;
  const labels = column.settings.labels ?? [];
  return {
    column,
    label: labels.find((label) => label.id === value?.labelId) ?? null,
    doneLabel:
      labels.find((label) => isDoneValue(column, { labelId: label.id } as CellValue)) ?? null,
  };
}

export function dateTargets(board: QueueBoard | undefined) {
  return {
    dateColumn: board?.columns.find((column) => column.type === 'date') ?? null,
    timelineColumn: board?.columns.find((column) => column.type === 'timeline') ?? null,
  };
}
