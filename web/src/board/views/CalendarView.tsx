import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { BoardFull, Item, User, View, ViewSettings } from '../../../../shared/types';
import { useCreateItem, useSetValue } from '../mutations';
import { Popover } from '../../components/ui/Popover';
import { Segmented } from '../../components/ui/Tabs';
import { labelStyle, useTheme } from '../../lib/labelColors';
import { cn } from '../../lib/cn';

function statusColor(item: Item, full: BoardFull): string | null {
  for (const column of full.columns) {
    if (column.type !== 'status') continue;
    const value = item.values[String(column.id)] as { labelId?: string } | undefined;
    const label = column.settings.labels?.find((entry) => entry.id === value?.labelId);
    if (label) return label.color;
  }
  return null;
}

function chipDates(item: Item, column: BoardFull['columns'][number]): string[] {
  const value = item.values[String(column.id)] as
    { date?: string; from?: string; to?: string } | undefined;
  if (!value) return [];
  if (column.type === 'date' && value.date) return [value.date];
  if (column.type === 'timeline' && value.from && value.to) {
    const days: string[] = [];
    let cursor = value.from;
    while (cursor <= value.to && days.length < 400) {
      days.push(cursor);
      cursor = addDays(parseISO(cursor), 1).toISOString().slice(0, 10);
    }
    return days;
  }
  return [];
}

function Chip({
  item,
  date,
  color,
  onOpen,
}: {
  item: Item;
  date: string;
  color: string | null;
  onOpen: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `cal:${item.id}:${date}`,
    data: { itemId: item.id, fromDate: date },
  });
  const theme = useTheme();
  const style = color ? labelStyle(color, theme) : null;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid="calendar-chip"
      data-item-id={item.id}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(item.id);
      }}
      style={{
        borderLeftColor: color ? labelStyle(color, theme).solid : 'var(--accent)',
        backgroundColor: style?.tint,
        color: style?.text,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      className="flex h-[22px] cursor-grab items-center truncate rounded-chip border-l-[3px] px-1.5 t-meta"
      title={item.name}
    >
      {item.name}
    </div>
  );
}

function DayCell({
  date,
  items,
  full,
  mode,
  outOfMonth,
  adding,
  onStartAdd,
  onCancelAdd,
  onCreate,
  onOpen,
}: {
  date: string;
  items: Item[];
  full: BoardFull;
  mode: 'month' | 'week';
  outOfMonth: boolean;
  adding: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onCreate: (name: string) => void;
  onOpen: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `cal-day:${date}` });
  const [name, setName] = useState('');
  const shown = items.slice(0, 4);
  return (
    <div
      ref={setNodeRef}
      data-testid="calendar-day"
      data-date={date}
      onClick={() => !adding && onStartAdd()}
      className={cn(
        'border-b border-r border-line p-1',
        mode === 'week' ? 'min-h-[420px]' : 'min-h-[96px]',
        isOver && 'bg-accent-soft',
        outOfMonth ? 'bg-canvas/50' : 'bg-surface',
      )}
    >
      <div className="mb-1 flex items-center justify-between px-0.5">
        <span
          className={cn(
            't-meta',
            isToday(parseISO(date))
              ? 'flex h-5 w-5 items-center justify-center rounded-full bg-accent font-semibold text-accent-ink'
              : 'text-muted',
          )}
        >
          {Number(date.slice(8, 10))}
        </span>
      </div>
      <div className="space-y-1">
        {shown.map((item) => (
          <Chip
            key={`${item.id}-${date}`}
            item={item}
            date={date}
            color={statusColor(item, full)}
            onOpen={onOpen}
          />
        ))}
        {items.length > 4 && (
          <Popover
            trigger={
              <button
                className="w-full rounded-control px-1 text-left t-meta text-muted hover:bg-sunken"
                onClick={(event) => event.stopPropagation()}
              >
                +{items.length - 4} more
              </button>
            }
          >
            <div className="max-h-[240px] space-y-1 overflow-auto p-1">
              {items.slice(4).map((item) => (
                <button
                  key={item.id}
                  className="block w-full truncate rounded-control px-1 py-0.5 text-left text-sm hover:bg-sunken"
                  onClick={() => onOpen(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </Popover>
        )}
        {adding && (
          <input
            autoFocus
            value={name}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              if (!name.trim()) onCancelAdd();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim()) {
                onCreate(name.trim());
                setName('');
              }
              if (event.key === 'Escape') {
                setName('');
                onCancelAdd();
              }
            }}
            placeholder="New item"
            className="h-6 w-full rounded-control border border-accent bg-surface px-1 text-sm text-ink outline-none"
          />
        )}
      </div>
    </div>
  );
}

export function CalendarView({
  full,
  items,
  boardId,
  view,
  settings,
  onChange,
  onOpen,
}: {
  full: BoardFull;
  items: Item[];
  users: Map<number, User>;
  boardId: number;
  view: View;
  settings: ViewSettings;
  onChange: (settings: ViewSettings) => void;
  onOpen: (id: number) => void;
}) {
  const [cursor, setCursor] = useState(new Date());
  const [adding, setAdding] = useState<string | null>(null);
  const [showNoDate, setShowNoDate] = useState(true);
  const setValue = useSetValue(boardId);
  const createItem = useCreateItem(boardId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const mode =
    settings.calendarMode ??
    (typeof window !== 'undefined' && window.innerWidth < 768 ? 'week' : 'month');
  const column =
    full.columns.find((entry) => entry.id === settings.calendarColumnId) ??
    full.columns.find((entry) => entry.type === 'date' || entry.type === 'timeline');

  const days = useMemo(() => {
    const start =
      mode === 'month'
        ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
        : startOfWeek(cursor, { weekStartsOn: 1 });
    return Array.from({ length: mode === 'month' ? 42 : 7 }, (_, index) =>
      format(addDays(start, index), 'yyyy-MM-dd'),
    );
  }, [cursor, mode]);

  if (!column) {
    return (
      <div className="p-6 text-sm text-muted">Add a Date or Timeline column to use Calendar.</div>
    );
  }

  const top = items.filter((item) => item.parentId === null);
  const byDate = new Map<string, Item[]>();
  for (const item of top) {
    for (const date of chipDates(item, column)) {
      const list = byDate.get(date) ?? [];
      list.push(item);
      byDate.set(date, list);
    }
  }
  const noDate = top.filter((item) => chipDates(item, column).length === 0);
  const title =
    mode === 'month'
      ? format(cursor, 'MMMM yyyy')
      : `${format(parseISO(days[0]), 'd MMM')} – ${format(parseISO(days[6]), 'd MMM yyyy')}`;

  function onDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    if (typeof overId !== 'string' || !overId.startsWith('cal-day:')) return;
    const target = overId.slice('cal-day:'.length);
    const data = event.active.data.current as { itemId: number; fromDate: string } | undefined;
    if (!data) return;
    const item = top.find((entry) => entry.id === data.itemId);
    if (!item) return;
    const value = item.values[String(column!.id)] as
      { date?: string; time?: string; from?: string; to?: string } | undefined;
    if (column!.type === 'date' && value?.date) {
      setValue.mutate({
        itemId: item.id,
        columnId: column!.id,
        value: { date: target, ...(value.time ? { time: value.time } : {}) },
      });
    } else if (column!.type === 'timeline' && value?.from && value.to) {
      const delta = differenceInCalendarDays(parseISO(target), parseISO(data.fromDate));
      setValue.mutate({
        itemId: item.id,
        columnId: column!.id,
        value: {
          from: format(addDays(parseISO(value.from), delta), 'yyyy-MM-dd'),
          to: format(addDays(parseISO(value.to), delta), 'yyyy-MM-dd'),
        },
      });
    }
  }

  function createOn(date: string, name: string) {
    const group = full.groups[0];
    if (!group) return;
    const value = column!.type === 'date' ? { date } : { from: date, to: date };
    createItem.mutate({
      groupId: group.id,
      name,
      values: { [String(column!.id)]: value },
    });
    setAdding(null);
  }

  return (
    <div className="h-full overflow-auto bg-canvas px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          className="rounded-control p-1.5 text-muted hover:bg-sunken"
          aria-label="Previous"
          title="Previous"
          onClick={() => setCursor(addDays(cursor, mode === 'month' ? -30 : -7))}
        >
          <ChevronLeft size={15} />
        </button>
        <button
          className="rounded-control border border-line-strong bg-surface px-2 py-0.5 text-sm text-ink"
          onClick={() => setCursor(new Date())}
        >
          Today
        </button>
        <button
          className="rounded-control p-1.5 text-muted hover:bg-sunken"
          aria-label="Next"
          title="Next"
          onClick={() => setCursor(addDays(cursor, mode === 'month' ? 30 : 7))}
        >
          <ChevronRight size={15} />
        </button>
        <span className="t-section ml-1 text-ink">{title}</span>
        <div className="ml-auto">
          <Segmented
            label="Calendar range"
            value={mode}
            onChange={(value) => onChange({ ...settings, calendarMode: value })}
            options={[
              { id: 'month', label: 'Month', title: 'Month' },
              { id: 'week', label: 'Week', title: 'Week' },
            ]}
          />
        </div>
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div
          className={cn(
            'grid border-l border-t border-line',
            mode === 'week' ? 'grid-cols-7' : 'grid-cols-7',
          )}
        >
          {days.slice(0, 7).map((date) => (
            <div
              key={`head-${date}`}
              className="border-b border-r border-line bg-surface-2 px-1 py-1 text-center t-label text-muted"
            >
              {format(parseISO(date), 'EEE d')}
            </div>
          ))}
          {days.map((date) => (
            <DayCell
              key={date}
              date={date}
              items={byDate.get(date) ?? []}
              full={full}
              mode={mode}
              outOfMonth={mode === 'month' && !isSameMonth(parseISO(date), cursor)}
              adding={adding === date}
              onStartAdd={() => setAdding(date)}
              onCancelAdd={() => setAdding(null)}
              onCreate={(name) => createOn(date, name)}
              onOpen={onOpen}
            />
          ))}
        </div>
      </DndContext>

      <div className="mt-4">
        <button
          className="flex items-center gap-1 t-label text-muted"
          onClick={() => setShowNoDate((value) => !value)}
        >
          <ChevronDown size={12} className={showNoDate ? '' : '-rotate-90'} />
          No date ({noDate.length})
        </button>
        {showNoDate && (
          <div className="mt-1 flex flex-wrap gap-1">
            {noDate.map((item) => (
              <button
                key={item.id}
                className="rounded-control border border-line bg-surface px-2 py-0.5 t-meta text-ink hover:bg-sunken"
                onClick={() => onOpen(item.id)}
              >
                {item.name}
              </button>
            ))}
            {noDate.length === 0 && <span className="t-meta text-muted">Nothing unscheduled.</span>}
          </div>
        )}
      </div>
      <div className="hidden">{boardId}</div>
      <div className="hidden">{view.id}</div>
    </div>
  );
}
