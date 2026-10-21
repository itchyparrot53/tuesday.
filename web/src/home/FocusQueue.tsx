import { useEffect, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { AlarmClock, ArrowRight, Check, ChevronDown } from 'lucide-react';
import type { BoardFull } from '../../../shared/types';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { Button } from '../components/ui/Button';
import { doneLabelIdsFor } from '../../../shared/columns';
import { Menu, MenuItem } from '../components/ui/Menu';
import type { BulkQueueRow, BulkEditFields } from './useQueueActions';
import { BulkEditDialog } from './BulkEditDialog';
import { dueLabel, lateDays, statusInfo, type QueueEntry } from './queue';

function QueueRow({
  entry,
  entryBoard,
  index,
  today,
  selected,
  busy,
  checked,
  onToggleCheck,
  onSelect,
  onComplete,
  onSnooze,
  onStatus,
  onOpen,
}: {
  entry: QueueEntry;
  entryBoard: BoardFull | undefined;
  index: number;
  today: string;
  selected: boolean;
  busy: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onSelect: () => void;
  onComplete: (board: BoardFull | undefined) => void;
  onSnooze: (board: BoardFull | undefined) => void;
  onStatus: (board: BoardFull | undefined, labelId: string, name: string) => void;
  onOpen: () => void;
}) {
  const board = entryBoard;
  const { column, label, doneLabel } = statusInfo(board, entry);
  const labels = column?.settings.labels ?? [];
  const doneIds = column ? doneLabelIdsFor(column) : [];
  const late = lateDays(entry, today);
  const canSnooze =
    Boolean(entry.dueDate) &&
    Boolean(board?.columns.some((column) => column.type === 'date' || column.type === 'timeline'));

  return (
    <div
      data-testid="home-myday-row"
      data-queue-index={index}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'relative flex cursor-pointer items-center gap-2 border-b border-line px-2 py-2.5 last:border-b-0',
        selected ? 'bg-surface-2' : 'hover:bg-surface-2',
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      {selected && (
        <span aria-hidden className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-accent" />
      )}
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggleCheck}
        onClick={(event) => event.stopPropagation()}
        aria-label={`Select ${entry.item.name}`}
        className="h-3.5 w-3.5 shrink-0 rounded-control border-line-strong"
      />
      <span className="hidden w-5 shrink-0 text-right t-meta tabular-nums text-muted sm:block">
        {String(index + 1).padStart(2, '0')}
      </span>
      <button
        type="button"
        data-testid="home-done"
        aria-label={`Mark ${entry.item.name} done`}
        title={doneLabel ? 'Mark done' : 'This board has no done status'}
        disabled={!doneLabel || busy}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-muted hover:bg-sunken hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        onClick={(event) => {
          event.stopPropagation();
          onComplete(board);
        }}
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-chip border border-line-strong">
          <Check size={11} />
        </span>
      </button>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: label?.color ?? 'var(--line-strong)' }}
        title={label?.name ?? 'No status'}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{entry.item.name}</p>
        <p className="truncate t-meta text-muted">{entry.board.name}</p>
      </div>
      <span
        className={cn(
          'w-[76px] shrink-0 text-right t-meta',
          late > 0 ? 'font-semibold text-danger-text' : 'text-muted',
        )}
      >
        {dueLabel(entry, today)}
      </span>
      {column && labels.length > 0 && (
        <span className="hidden md:block">
          <Menu
            align="end"
            trigger={
              <button
                type="button"
                aria-label={`Change status. Current status ${label?.name ?? 'not set'}`}
                className="inline-flex h-6 items-center gap-1 rounded-full bg-sunken px-2 t-meta font-semibold text-ink hover:bg-line"
                onClick={(event) => event.stopPropagation()}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: label?.color ?? 'var(--line-strong)' }}
                />
                <span className="max-w-[92px] truncate">{label?.name ?? 'Status'}</span>
                <ChevronDown size={10} className="text-muted" />
              </button>
            }
          >
            {labels.map((option) => (
              <MenuItem key={option.id} onSelect={() => onStatus(board, option.id, option.name)}>
                <span
                  className="mr-2 inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: option.color }}
                />
                {option.name}
                {doneIds.includes(option.id) && (
                  <span
                    aria-hidden="true"
                    className="ml-auto flex items-center gap-1 t-meta text-muted"
                  >
                    <Check size={11} className="text-success" />
                    Done
                  </span>
                )}
              </MenuItem>
            ))}
          </Menu>
        </span>
      )}
      <button
        type="button"
        data-testid="home-snooze"
        aria-label="Snooze 1 day"
        title={entry.dueDate ? 'Snooze 1 day' : 'This item has no due date'}
        disabled={!canSnooze || busy}
        className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-control text-muted hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 sm:flex"
        onClick={(event) => {
          event.stopPropagation();
          onSnooze(board);
        }}
      >
        <AlarmClock size={14} />
      </button>
      <button
        type="button"
        data-testid="home-open"
        aria-label={`Open ${entry.item.name}`}
        title="Open item"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control text-muted hover:bg-sunken hover:text-ink"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        <ArrowRight size={14} />
      </button>
    </div>
  );
}

export function FocusQueue({
  entries,
  offset,
  today,
  selected,
  isBusy,
  onSelect,
  onComplete,
  onSnooze,
  onStatus,
  onOpen,
  onBulkComplete,
  onBulkSnooze,
  onBulkEdit,
}: {
  entries: QueueEntry[];
  offset: number;
  today: string;
  selected: number;
  isBusy: (itemId: number) => boolean;
  onSelect: (index: number) => void;
  onComplete: (entry: QueueEntry, board: BoardFull | undefined) => void;
  onSnooze: (entry: QueueEntry, board: BoardFull | undefined) => void;
  onStatus: (
    entry: QueueEntry,
    board: BoardFull | undefined,
    labelId: string,
    name: string,
  ) => void;
  onOpen: (entry: QueueEntry) => void;
  onBulkComplete: (rows: BulkQueueRow[]) => Promise<void>;
  onBulkSnooze: (rows: BulkQueueRow[]) => Promise<void>;
  onBulkEdit: (rows: BulkQueueRow[], fields: BulkEditFields) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const boardQueries = useQueries({
    queries: entries.map((entry) => ({
      queryKey: ['board', entry.board.id],
      queryFn: () => api<BoardFull>('GET', `/boards/${entry.board.id}`),
      enabled: entry.board.id > 0,
    })),
  });
  const boards = entries.map((_, index) => boardQueries[index]?.data);
  const selectedRows = entries
    .map((entry, index) => ({ entry, board: boards[index] }))
    .filter((row) => selectedIds.has(row.entry.item.id));
  const allSelected = entries.length > 0 && selectedIds.size === entries.length;

  useEffect(() => {
    const valid = new Set(entries.map((entry) => entry.item.id));
    setSelectedIds((previous) => {
      const next = new Set([...previous].filter((id) => valid.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [entries]);

  function toggle(id: number) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(entries.map((entry) => entry.item.id)));
  }

  return (
    <div
      data-testid="home-queue"
      className="overflow-hidden rounded-sheet border border-line bg-surface"
    >
      {selectedIds.size > 0 && (
        <div
          data-testid="home-bulk-bar"
          className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-2 py-1.5"
        >
          <span className="t-meta font-semibold text-accent-soft-ink">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            className="t-meta text-accent-soft-ink underline"
            onClick={toggleAll}
          >
            {allSelected ? 'Clear' : 'Select all'}
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Button
              data-testid="home-bulk-complete"
              size="sm"
              variant="secondary"
              onClick={() => {
                void onBulkComplete(selectedRows);
                setSelectedIds(new Set());
              }}
            >
              Complete
            </Button>
            <Button
              data-testid="home-bulk-snooze"
              size="sm"
              variant="secondary"
              onClick={() => {
                void onBulkSnooze(selectedRows);
                setSelectedIds(new Set());
              }}
            >
              Snooze 1 day
            </Button>
            <Button
              data-testid="home-bulk-edit"
              size="sm"
              variant="secondary"
              onClick={() => setEditOpen(true)}
            >
              Edit fields
            </Button>
          </div>
        </div>
      )}
      {entries.map((entry, index) => (
        <QueueRow
          key={entry.item.id}
          entry={entry}
          entryBoard={boards[index]}
          index={index + offset}
          today={today}
          selected={selected === index + offset}
          checked={selectedIds.has(entry.item.id)}
          onToggleCheck={() => toggle(entry.item.id)}
          busy={isBusy(entry.item.id)}
          onSelect={() => onSelect(index + offset)}
          onComplete={(board) => onComplete(entry, board)}
          onSnooze={(board) => onSnooze(entry, board)}
          onStatus={(board, labelId, name) => onStatus(entry, board, labelId, name)}
          onOpen={() => onOpen(entry)}
        />
      ))}
      <BulkEditDialog
        rows={selectedRows}
        open={editOpen}
        onOpenChange={setEditOpen}
        onApply={(fields) => {
          void onBulkEdit(selectedRows, fields);
          setSelectedIds(new Set());
        }}
      />
    </div>
  );
}
