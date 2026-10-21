import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { addDays, differenceInCalendarDays, format, isWeekend, parseISO } from 'date-fns';
import type { BoardFull, Column, Item, User, View, ViewSettings } from '../../../../shared/types';
import { useSetValue } from '../mutations';
import { labelStyle, useTheme } from '../../lib/labelColors';

const ZOOM: Record<'week' | 'month' | 'quarter', number> = { week: 40, month: 14, quarter: 5 };

function statusColor(item: Item, full: BoardFull): string | null {
  for (const column of full.columns) {
    if (column.type !== 'status') continue;
    const value = item.values[String(column.id)] as { labelId?: string } | undefined;
    const label = column.settings.labels?.find((entry) => entry.id === value?.labelId);
    if (label) return label.color;
  }
  return null;
}

function itemDates(item: Item, column: Column): { from: string; to: string } | null {
  const value = item.values[String(column.id)] as
    { date?: string; from?: string; to?: string } | undefined;
  if (column.type === 'date' && value?.date) return { from: value.date, to: value.date };
  if (column.type === 'timeline' && value?.from && value.to) {
    return { from: value.from, to: value.to };
  }
  return null;
}

export interface DependencyArrow {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  danger: boolean;
}

export function renderDependencyArrows(
  arrows: DependencyArrow[],
  width: number,
  height: number,
): ReactNode {
  if (!arrows.length) return null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[2]"
      width={width}
      height={height}
      aria-hidden
    >
      {arrows.map((arrow, index) => {
        const mid = Math.max(arrow.x1 + 8, arrow.x2 - 8);
        return (
          <g key={index}>
            <path
              d={`M ${arrow.x1} ${arrow.y1} H ${mid} V ${arrow.y2} H ${arrow.x2}`}
              fill="none"
              stroke={arrow.danger ? 'var(--danger)' : 'var(--line-strong)'}
              strokeWidth={1.5}
            />
            <path
              d={`M ${arrow.x2 - 5} ${arrow.y2 - 4} L ${arrow.x2} ${arrow.y2} L ${arrow.x2 - 5} ${arrow.y2 + 4}`}
              fill="none"
              stroke={arrow.danger ? 'var(--danger)' : 'var(--line-strong)'}
              strokeWidth={1.5}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function TimelineView({
  full,
  items,
  boardId,
  view,
  settings,
  onOpen,
}: {
  full: BoardFull;
  items: Item[];
  users: Map<number, User>;
  boardId: number;
  view: View;
  settings: ViewSettings;
  onOpen: (id: number) => void;
}) {
  const theme = useTheme();
  const setValue = useSetValue(boardId);
  const zoom = settings.timelineZoom ?? 'month';
  const px = ZOOM[zoom];
  const column =
    full.columns.find((entry) => entry.id === settings.timelineColumnId) ??
    full.columns.find((entry) => entry.type === 'timeline' || entry.type === 'date');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    itemId: number;
    from: string;
    to: string;
    mode: 'move' | 'left' | 'right';
    startX: number;
    originalFrom: string;
    originalTo: string;
  } | null>(null);

  const top = items.filter((item) => item.parentId === null);
  const today = format(new Date(), 'yyyy-MM-dd');

  const range = useMemo(() => {
    let min = today;
    let max = today;
    for (const item of top) {
      if (!column) continue;
      const dates = itemDates(item, column);
      if (!dates) continue;
      if (dates.from < min) min = dates.from;
      if (dates.to > max) max = dates.to;
    }
    min = format(addDays(parseISO(min), -14), 'yyyy-MM-dd');
    max = format(addDays(parseISO(max), 30), 'yyyy-MM-dd');
    const days = differenceInCalendarDays(parseISO(max), parseISO(min)) + 1;
    return { start: min, end: max, days };
  }, [top, column, today]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const offset = (differenceInCalendarDays(parseISO(today), parseISO(range.start)) - 7) * px;
    scrollRef.current.scrollLeft = Math.max(0, offset);
  }, [range.start, px, today]);

  if (!column) {
    return (
      <div className="p-6 text-sm text-muted">Add a Timeline or Date column to use Timeline.</div>
    );
  }

  const dateFor = (offset: number) => format(addDays(parseISO(range.start), offset), 'yyyy-MM-dd');

  const headers: { offset: number; label: string; width: number }[] = [];
  if (zoom === 'quarter') {
    for (let offset = 0; offset < range.days; offset++) {
      const date = parseISO(dateFor(offset));
      if (date.getUTCDate() === 1) {
        headers.push({ offset, label: format(date, 'MMM'), width: 0 });
      }
    }
    for (let index = 0; index < headers.length; index++) {
      const next = headers[index + 1]?.offset ?? range.days;
      headers[index].width = (next - headers[index].offset) * px;
    }
  } else if (zoom === 'month') {
    for (let offset = 0; offset < range.days; offset++) {
      const date = parseISO(dateFor(offset));
      if (date.getUTCDay() === 1) {
        headers.push({ offset, label: format(date, 'd MMM'), width: 7 * px });
      }
    }
  } else {
    for (let offset = 0; offset < range.days; offset++) {
      headers.push({ offset, label: format(parseISO(dateFor(offset)), 'd'), width: px });
    }
  }

  function beginDrag(
    event: ReactMouseEvent,
    item: Item,
    dates: { from: string; to: string },
    mode: 'move' | 'left' | 'right',
  ) {
    event.preventDefault();
    event.stopPropagation();
    setDrag({
      itemId: item.id,
      from: dates.from,
      to: dates.to,
      mode,
      startX: event.clientX,
      originalFrom: dates.from,
      originalTo: dates.to,
    });
    const move = (moveEvent: MouseEvent) => {
      const delta = Math.round((moveEvent.clientX - event.clientX) / px);
      setDrag((current) => {
        if (!current) return current;
        if (current.mode === 'move') {
          return {
            ...current,
            from: format(addDays(parseISO(current.originalFrom), delta), 'yyyy-MM-dd'),
            to: format(addDays(parseISO(current.originalTo), delta), 'yyyy-MM-dd'),
          };
        }
        if (current.mode === 'left') {
          const next = format(addDays(parseISO(current.originalFrom), delta), 'yyyy-MM-dd');
          return { ...current, from: next > current.to ? current.to : next };
        }
        const next = format(addDays(parseISO(current.originalTo), delta), 'yyyy-MM-dd');
        return { ...current, to: next < current.from ? current.from : next };
      });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setDrag((current) => {
        if (!current) return null;
        if (current.from !== current.originalFrom || current.to !== current.originalTo) {
          const value =
            column!.type === 'date'
              ? { date: current.from }
              : { from: current.from, to: current.to };
          setValue.mutate({ itemId: current.itemId, columnId: column!.id, value });
        }
        return null;
      });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  function setDates(item: Item) {
    const value =
      column!.type === 'date'
        ? { date: today }
        : { from: today, to: format(addDays(parseISO(today), 2), 'yyyy-MM-dd') };
    setValue.mutate({ itemId: item.id, columnId: column!.id, value });
  }

  const totalHeight = full.groups.reduce(
    (sum, group) => sum + 32 + top.filter((item) => item.groupId === group.id).length * 36,
    0,
  );
  const rowY = new Map<number, number>();
  let rowOffset = 0;
  for (const group of full.groups) {
    rowOffset += 32;
    for (const item of top.filter((entry) => entry.groupId === group.id)) {
      rowY.set(item.id, rowOffset + 18);
      rowOffset += 36;
    }
  }
  const dependencyArrows: DependencyArrow[] = [];
  for (const dependencyColumn of full.columns.filter((entry) => entry.type === 'dependency')) {
    for (const item of top) {
      const ids = ((item.values[String(dependencyColumn.id)] as { itemIds?: number[] } | undefined)
        ?.itemIds ?? []) as number[];
      const dependent = itemDates(item, column);
      if (!dependent) continue;
      for (const predecessorId of ids) {
        const predecessor = top.find((entry) => entry.id === predecessorId);
        if (!predecessor) continue;
        const predecessorDates = itemDates(predecessor, column);
        if (!predecessorDates) continue;
        const x1 =
          (differenceInCalendarDays(parseISO(predecessorDates.to), parseISO(range.start)) + 1) * px;
        const x2 = differenceInCalendarDays(parseISO(dependent.from), parseISO(range.start)) * px;
        dependencyArrows.push({
          x1,
          y1: rowY.get(predecessor.id) ?? 0,
          x2,
          y2: rowY.get(item.id) ?? 0,
          danger: dependent.from < predecessorDates.to,
        });
      }
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-[140px] shrink-0 overflow-y-auto border-r border-line bg-surface-2 md:w-[280px]">
          <div className="sticky top-0 z-10 flex h-9 items-center border-b border-line bg-surface-2 px-3 t-label text-muted">
            Item
          </div>
          {full.groups.map((group) => (
            <div key={group.id}>
              <div
                className="flex h-8 items-center gap-2 px-3 t-label text-ink"
                style={{ borderLeft: `4px solid ${labelStyle(group.color, theme).solid}` }}
              >
                {group.title}
              </div>
              {top
                .filter((item) => item.groupId === group.id)
                .map((item) => {
                  const dates = itemDates(item, column);
                  return (
                    <div
                      key={item.id}
                      className="flex h-9 items-center gap-2 border-b border-line px-3 text-sm"
                    >
                      <button
                        className="min-w-0 flex-1 truncate text-left"
                        onClick={() => onOpen(item.id)}
                      >
                        {item.name}
                      </button>
                      {!dates && (
                        <button
                          className="shrink-0 t-meta text-accent"
                          onClick={() => setDates(item)}
                        >
                          Set dates
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>

        <div
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label="Timeline"
          className="min-w-0 flex-1 overflow-auto"
        >
          <div style={{ width: range.days * px }}>
            <div className="sticky top-0 z-10 flex h-9 border-b border-line bg-surface">
              {headers.map((header) => (
                <div
                  key={`${header.offset}-${header.label}`}
                  className="flex shrink-0 items-center border-r border-line px-1 t-label text-muted"
                  style={{ width: Math.max(header.width, px) }}
                >
                  {header.label}
                </div>
              ))}
            </div>
            <div className="relative" style={{ height: totalHeight }}>
              <div className="absolute inset-0 flex" aria-hidden>
                {Array.from({ length: range.days }, (_, offset) =>
                  isWeekend(parseISO(dateFor(offset))) ? (
                    <div
                      key={offset}
                      className="h-full shrink-0 bg-surface-2"
                      style={{ width: px }}
                    />
                  ) : (
                    <div key={offset} className="h-full shrink-0" style={{ width: px }} />
                  ),
                )}
              </div>
              <div
                className="absolute top-0 z-[1] w-[2px] bg-accent"
                style={{
                  left: differenceInCalendarDays(parseISO(today), parseISO(range.start)) * px,
                  height: totalHeight,
                }}
              >
                <span className="absolute left-1 top-1 whitespace-nowrap rounded-chip bg-accent px-1 t-meta text-accent-ink">
                  Today
                </span>
              </div>
              {full.groups.map((group) => (
                <div key={group.id}>
                  <div className="h-8 border-b border-line bg-canvas" />
                  {top
                    .filter((item) => item.groupId === group.id)
                    .map((item) => {
                      const dates = itemDates(item, column);
                      const preview =
                        drag && drag.itemId === item.id ? { from: drag.from, to: drag.to } : dates;
                      const left = preview
                        ? differenceInCalendarDays(parseISO(preview.from), parseISO(range.start)) *
                          px
                        : 0;
                      const width = preview
                        ? (differenceInCalendarDays(parseISO(preview.to), parseISO(preview.from)) +
                            1) *
                          px
                        : 0;
                      return (
                        <div key={item.id} className="relative h-9 border-b border-line">
                          {preview && (
                            <div
                              data-testid="timeline-bar"
                              data-item-id={item.id}
                              className="absolute top-1.5 z-[2] flex h-6 cursor-grab items-center rounded-chip bg-accent/80 px-1 t-meta text-accent-ink"
                              style={{
                                left,
                                width: Math.max(width, px),
                                backgroundColor: statusColor(item, full)
                                  ? labelStyle(statusColor(item, full)!, theme).solid
                                  : undefined,
                              }}
                              onMouseDown={(event) => beginDrag(event, item, preview, 'move')}
                              onClick={() => onOpen(item.id)}
                            >
                              {column.type === 'timeline' && (
                                <span
                                  className="absolute bottom-0 left-0 top-0 w-1.5 cursor-ew-resize"
                                  onMouseDown={(event) => beginDrag(event, item, preview, 'left')}
                                />
                              )}
                              {column.type === 'timeline' && (
                                <span
                                  className="absolute bottom-0 right-0 top-0 w-1.5 cursor-ew-resize"
                                  onMouseDown={(event) => beginDrag(event, item, preview, 'right')}
                                />
                              )}
                            </div>
                          )}
                          {preview && (
                            <span
                              className="pointer-events-none absolute top-2.5 z-[2] whitespace-nowrap t-meta text-ink"
                              style={{ left: left + Math.max(width, px) + 4 }}
                            >
                              {item.name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              ))}
              {renderDependencyArrows(dependencyArrows, range.days * px, totalHeight)}
            </div>
          </div>
        </div>
      </div>
      <div className="hidden">
        {boardId}
        {view.id}
      </div>
    </div>
  );
}
