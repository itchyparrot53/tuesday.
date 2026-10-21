import { useQuery } from '@tanstack/react-query';
import { AlarmClock, ArrowRight, Check, ChevronDown } from 'lucide-react';
import type { BoardFull } from '../../../shared/types';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { Button } from '../components/ui/Button';
import { doneLabelIdsFor } from '../../../shared/columns';
import { Menu, MenuItem } from '../components/ui/Menu';
import { dueDetail, dueLabel, dueSentence, lateDays, statusInfo, type QueueEntry } from './queue';

export function useQueueBoard(boardId: number) {
  return useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api<BoardFull>('GET', `/boards/${boardId}`),
    enabled: Number.isFinite(boardId) && boardId > 0,
  });
}

function Fact({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 t-meta text-muted">{label}</dt>
      <dd
        className={cn(
          'min-w-0 text-right t-meta font-medium',
          danger ? 'text-danger-text' : 'text-ink',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function FocusCard({
  entry,
  board,
  workspaceName,
  today,
  position,
  total,
  selected,
  busy,
  onComplete,
  onSnooze,
  onOpen,
  onStatus,
}: {
  entry: QueueEntry;
  board: BoardFull | undefined;
  workspaceName?: string;
  today: string;
  position: number;
  total: number;
  selected: boolean;
  busy: boolean;
  onComplete: () => void;
  onSnooze: () => void;
  onOpen: () => void;
  onStatus: (labelId: string, name: string) => void;
}) {
  const { column, label, doneLabel } = statusInfo(board, entry);
  const late = lateDays(entry, today);
  const labels = column?.settings.labels ?? [];
  const doneIds = column ? doneLabelIdsFor(column) : [];
  const canSnooze =
    Boolean(entry.dueDate) &&
    Boolean(board?.columns.some((column) => column.type === 'date' || column.type === 'timeline'));

  return (
    <section
      data-testid="home-myday-row"
      data-queue-index={position - 1}
      aria-current={selected ? 'true' : undefined}
      aria-labelledby="focus-title"
      className="relative overflow-hidden rounded-sheet border border-line bg-surface"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 h-64 w-64 rounded-full bg-accent-soft opacity-70 blur-3xl"
      />
      <div className="relative flex flex-col gap-5 p-5 lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {column && labels.length > 0 ? (
              <Menu
                align="start"
                trigger={
                  <button
                    type="button"
                    className="inline-flex h-6 items-center gap-1.5 rounded-full bg-sunken px-2 t-meta font-semibold text-ink hover:bg-line"
                    aria-label={`Change status. Current status ${label?.name ?? 'not set'}`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: label?.color ?? 'var(--line-strong)' }}
                    />
                    {label?.name ?? 'Set status'}
                    <ChevronDown size={11} className="text-muted" />
                  </button>
                }
              >
                {labels.map((option) => (
                  <MenuItem key={option.id} onSelect={() => onStatus(option.id, option.name)}>
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
            ) : (
              <span className="inline-flex h-6 items-center rounded-full bg-sunken px-2 t-meta font-semibold text-muted">
                {board ? 'No status' : 'Loading'}
              </span>
            )}
            <span className="min-w-0 truncate t-meta text-muted">
              {entry.board.name}
              {workspaceName ? ` · ${workspaceName}` : ''}
            </span>
            {late > 0 && (
              <span className="ml-auto inline-flex h-6 items-center rounded-full bg-danger-soft px-2 t-meta font-semibold text-danger-text">
                {dueLabel(entry, today)}
              </span>
            )}
          </div>

          <h2 id="focus-title" className="mt-3 t-display text-ink">
            {entry.item.name}
          </h2>
          <p className="mt-2 text-sm text-muted">{dueSentence(entry, today)}</p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button
              data-testid="home-done"
              className="transition-none!"
              icon={<Check size={15} />}
              loading={busy}
              disabled={!board || !doneLabel || busy}
              title={
                !board
                  ? 'Loading board'
                  : !doneLabel
                    ? 'This board has no done status'
                    : 'Mark done'
              }
              onClick={onComplete}
            >
              Complete
            </Button>
            <Button
              data-testid="home-snooze"
              className="transition-none!"
              variant="secondary"
              icon={<AlarmClock size={15} />}
              disabled={!canSnooze || busy}
              title={entry.dueDate ? 'Snooze 1 day' : 'This item has no due date'}
              onClick={onSnooze}
            >
              Snooze
            </Button>
            <Button data-testid="home-open" variant="ghost" onClick={onOpen}>
              Open <ArrowRight size={15} />
            </Button>
          </div>
          {board && !doneLabel && (
            <p className="mt-3 t-meta text-muted">
              This board has no done status. Open the item to change its status.
            </p>
          )}
        </div>

        <aside className="hidden w-[224px] shrink-0 border-l border-line pl-5 lg:block">
          <p className="t-label text-muted">Why this is first</p>
          <dl className="mt-3 space-y-2.5">
            <Fact
              label="Due"
              value={entry.dueDate ? dueDetail(entry, today) : 'No due date'}
              danger={late > 0}
            />
            <Fact label="Status" value={label?.name ?? 'No status'} />
            <Fact label="Queue" value={`${position} of ${total}`} />
          </dl>
          <p className="mt-4 t-meta text-muted">
            Ranked by due date across today and the next three days.
          </p>
        </aside>
      </div>
    </section>
  );
}
