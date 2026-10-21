import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { HomeSummary } from '../../../shared/types';
import { api } from '../lib/api';
import { addDays } from '../lib/dates';
import { undoStack } from '../lib/undo';
import { useToast } from '../components/ui/Toast';
import { dateTargets, statusInfo, type QueueBoard, type QueueEntry } from './queue';

function withoutEntry(home: HomeSummary | undefined, entry: QueueEntry): HomeSummary | undefined {
  if (!home) return home;
  const strip = (list: QueueEntry[]) => list.filter((row) => row.item.id !== entry.item.id);
  return {
    ...home,
    counts: {
      ...home.counts,
      open: Math.max(0, home.counts.open - 1),
      dueToday: Math.max(0, home.counts.dueToday - (entry.bucket === 'today' ? 1 : 0)),
      overdue: Math.max(0, home.counts.overdue - (entry.bucket === 'overdue' ? 1 : 0)),
    },
    myDay: {
      overdue: strip(home.myDay.overdue),
      today: strip(home.myDay.today),
      upcoming: strip(home.myDay.upcoming),
    },
  };
}

export interface BulkQueueRow {
  entry: QueueEntry;
  board: QueueBoard | undefined;
}

export interface BulkEditFields {
  statusName?: string;
  dueDate?: string;
  assigneeId?: number;
}

export function useQueueActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState<number[]>([]);

  const mark = useCallback((itemId: number, on: boolean) => {
    setBusy((previous) =>
      on ? [...new Set([...previous, itemId])] : previous.filter((id) => id !== itemId),
    );
  }, []);

  const refresh = useCallback(
    async (entry: QueueEntry) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['home'] }),
        qc.invalidateQueries({ queryKey: ['board', entry.board.id] }),
        qc.invalidateQueries({ queryKey: ['items', entry.board.id] }),
        qc.invalidateQueries({ queryKey: ['my-work'] }),
      ]);
    },
    [qc],
  );

  const write = useCallback(
    async (
      entry: QueueEntry,
      columnId: number,
      value: unknown,
      previous: unknown,
      message: string,
      optimisticRemove: boolean,
    ) => {
      const before = qc.getQueryData<HomeSummary>(['home']);
      if (optimisticRemove) qc.setQueryData(['home'], withoutEntry(before, entry));
      mark(entry.item.id, true);
      try {
        await api('PUT', `/items/${entry.item.id}/values/${columnId}`, { value });
        await refresh(entry);
        const undo = async () => {
          await api('PUT', `/items/${entry.item.id}/values/${columnId}`, { value: previous });
          await refresh(entry);
        };
        toast.show(message, 'success', { label: 'Undo', onClick: () => void undo() });
        undoStack.push({ label: message, undo });
      } catch (error) {
        if (before) qc.setQueryData(['home'], before);
        toast.show((error as Error).message, 'error');
      } finally {
        mark(entry.item.id, false);
      }
    },
    [mark, qc, refresh, toast],
  );

  const complete = useCallback(
    async (entry: QueueEntry, board: QueueBoard | undefined) => {
      const { column, doneLabel } = statusInfo(board, entry);
      if (!column || !doneLabel) {
        toast.show('This board has no done status yet', 'error');
        return;
      }
      const previous = entry.item.values[String(column.id)] ?? null;
      await write(entry, column.id, { labelId: doneLabel.id }, previous, 'Marked done', true);
    },
    [toast, write],
  );

  const snooze = useCallback(
    async (entry: QueueEntry, board: QueueBoard | undefined) => {
      if (!entry.dueDate) {
        toast.show('This item has no due date to snooze', 'error');
        return;
      }
      const { dateColumn, timelineColumn } = dateTargets(board);
      if (dateColumn) {
        const previous = entry.item.values[String(dateColumn.id)] ?? null;
        await write(
          entry,
          dateColumn.id,
          { date: addDays(entry.dueDate, 1) },
          previous,
          'Snoozed 1 day',
          true,
        );
        return;
      }
      if (timelineColumn) {
        const current = entry.item.values[String(timelineColumn.id)] as
          { from?: string; to?: string } | undefined;
        const previous = current ?? null;
        await write(
          entry,
          timelineColumn.id,
          {
            from: current?.from ? addDays(current.from, 1) : addDays(entry.dueDate, 1),
            to: addDays(entry.dueDate, 1),
          },
          previous,
          'Snoozed 1 day',
          true,
        );
        return;
      }
      toast.show('This board has no date column to snooze', 'error');
    },
    [toast, write],
  );

  const setStatus = useCallback(
    async (
      entry: QueueEntry,
      board: QueueBoard | undefined,
      labelId: string,
      labelName: string,
    ) => {
      const { column } = statusInfo(board, entry);
      if (!column) return;
      const previous = entry.item.values[String(column.id)] ?? null;
      await write(entry, column.id, { labelId }, previous, `Status set to ${labelName}`, false);
    },
    [write],
  );

  const applyBulk = useCallback(
    async (
      ops: {
        entry: QueueEntry;
        columnId: number;
        value: unknown;
        previous: unknown;
      }[],
      label: string,
      skipped: number,
    ) => {
      if (!ops.length) return;
      const before = qc.getQueryData<HomeSummary>(['home']);
      let optimistic = before;
      for (const op of ops) optimistic = withoutEntry(optimistic, op.entry);
      if (optimistic) qc.setQueryData(['home'], optimistic);
      for (const op of ops) mark(op.entry.item.id, true);
      try {
        for (const op of ops) {
          await api('PUT', `/items/${op.entry.item.id}/values/${op.columnId}`, {
            value: op.value,
          });
        }
        const boardIds = [...new Set(ops.map((op) => op.entry.board.id))];
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['home'] }),
          qc.invalidateQueries({ queryKey: ['my-work'] }),
          ...boardIds.flatMap((boardId) => [
            qc.invalidateQueries({ queryKey: ['board', boardId] }),
            qc.invalidateQueries({ queryKey: ['items', boardId] }),
          ]),
        ]);
        const undo = async () => {
          for (const op of ops) {
            await api('PUT', `/items/${op.entry.item.id}/values/${op.columnId}`, {
              value: op.previous,
            });
          }
          await qc.invalidateQueries({ queryKey: ['home'] });
          await qc.invalidateQueries({ queryKey: ['my-work'] });
          for (const boardId of boardIds) {
            await qc.invalidateQueries({ queryKey: ['board', boardId] });
            await qc.invalidateQueries({ queryKey: ['items', boardId] });
          }
        };
        const message = `${ops.length} ${ops.length === 1 ? 'item' : 'items'} ${label}${skipped ? `, ${skipped} skipped` : ''}`;
        toast.show(message, 'success', { label: 'Undo', onClick: () => void undo() });
        undoStack.push({ label: message, undo });
      } catch (error) {
        if (before) qc.setQueryData(['home'], before);
        toast.show((error as Error).message, 'error');
      } finally {
        for (const op of ops) mark(op.entry.item.id, false);
      }
    },
    [mark, qc, toast],
  );

  const bulkComplete = useCallback(
    async (rows: BulkQueueRow[]) => {
      const pairs = rows
        .map(({ entry, board }) => {
          const { column, doneLabel } = statusInfo(board, entry);
          if (!column || !doneLabel) return null;
          return {
            entry,
            columnId: column.id,
            previous: entry.item.values[String(column.id)] ?? null,
            value: { labelId: doneLabel.id },
          };
        })
        .filter((value): value is NonNullable<typeof value> => Boolean(value));
      if (!pairs.length) {
        toast.show('None of the selected items have a done status', 'error');
        return;
      }
      await applyBulk(pairs, 'completed', rows.length - pairs.length);
    },
    [applyBulk, toast],
  );

  const bulkSnooze = useCallback(
    async (rows: BulkQueueRow[]) => {
      const pairs = rows
        .map(({ entry, board }) => {
          if (!entry.dueDate) return null;
          const { dateColumn, timelineColumn } = dateTargets(board);
          if (dateColumn) {
            return {
              entry,
              columnId: dateColumn.id,
              previous: entry.item.values[String(dateColumn.id)] ?? null,
              value: { date: addDays(entry.dueDate, 1) },
            };
          }
          if (timelineColumn) {
            const current = entry.item.values[String(timelineColumn.id)] as
              { from?: string; to?: string } | undefined;
            return {
              entry,
              columnId: timelineColumn.id,
              previous: current ?? null,
              value: {
                from: current?.from ? addDays(current.from, 1) : addDays(entry.dueDate, 1),
                to: addDays(entry.dueDate, 1),
              },
            };
          }
          return null;
        })
        .filter((value): value is NonNullable<typeof value> => Boolean(value));
      if (!pairs.length) {
        toast.show('None of the selected items can be snoozed', 'error');
        return;
      }
      await applyBulk(pairs, 'snoozed 1 day', rows.length - pairs.length);
    },
    [applyBulk, toast],
  );

  const bulkEdit = useCallback(
    async (rows: BulkQueueRow[], fields: BulkEditFields) => {
      const ops: { entry: QueueEntry; columnId: number; value: unknown; previous: unknown }[] = [];
      let skipped = 0;
      for (const { entry, board } of rows) {
        if (!board) {
          skipped++;
          continue;
        }
        let applied = false;
        if (fields.statusName) {
          const column = board.columns.find((candidate) => candidate.type === 'status');
          const label = column?.settings.labels?.find(
            (candidate) => candidate.name.toLowerCase() === fields.statusName!.toLowerCase(),
          );
          if (column && label) {
            ops.push({
              entry,
              columnId: column.id,
              previous: entry.item.values[String(column.id)] ?? null,
              value: { labelId: label.id },
            });
            applied = true;
          }
        }
        if (fields.dueDate) {
          const column = board.columns.find((candidate) => candidate.type === 'date');
          if (column) {
            ops.push({
              entry,
              columnId: column.id,
              previous: entry.item.values[String(column.id)] ?? null,
              value: { date: fields.dueDate },
            });
            applied = true;
          }
        }
        if (fields.assigneeId) {
          const column = board.columns.find((candidate) => candidate.type === 'people');
          if (column) {
            ops.push({
              entry,
              columnId: column.id,
              previous: entry.item.values[String(column.id)] ?? null,
              value: { userIds: [fields.assigneeId] },
            });
            applied = true;
          }
        }
        if (!applied) skipped++;
      }
      if (!ops.length) {
        toast.show('None of the selected items could be updated', 'error');
        return;
      }
      await applyBulk(ops, 'updated', skipped);
    },
    [applyBulk, toast],
  );

  const isBusy = useCallback((itemId: number) => busy.includes(itemId), [busy]);

  return useMemo(
    () => ({ complete, snooze, setStatus, bulkComplete, bulkSnooze, bulkEdit, isBusy }),
    [complete, snooze, setStatus, bulkComplete, bulkSnooze, bulkEdit, isBusy],
  );
}
