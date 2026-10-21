import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { MessageSquare, Plus } from 'lucide-react';
import { isDoneValue, type CellValue } from '../../../../shared/columns';
import type { BoardFull, Column, Item, User, View } from '../../../../shared/types';
import { CellDisplay } from '../cells/CellDisplay';
import { useCreateItem, useSetValue } from '../mutations';
import { cn } from '../../lib/cn';
import { labelStyle, useTheme } from '../../lib/labelColors';

interface Lane {
  key: string;
  label: string;
  color: string | null;
  value: unknown;
}

function laneValue(column: Column, laneKey: string): unknown {
  if (laneKey === 'none') return null;
  if (column.type === 'status') return { labelId: laneKey };
  if (column.type === 'dropdown') return { optionIds: [laneKey] };
  return { userIds: [Number(laneKey)] };
}

function itemLaneKey(item: Item, column: Column): string {
  const value = item.values[String(column.id)] as
    { labelId?: string; optionIds?: string[]; userIds?: number[] } | undefined;
  if (column.type === 'status') return value?.labelId ?? 'none';
  if (column.type === 'dropdown') return value?.optionIds?.[0] ?? 'none';
  return value?.userIds?.[0] ? String(value.userIds[0]) : 'none';
}

function statusColor(item: Item, columns: Column[]): string | null {
  for (const column of columns) {
    if (column.type !== 'status') continue;
    const value = item.values[String(column.id)] as { labelId?: string } | undefined;
    const label = column.settings.labels?.find((entry) => entry.id === value?.labelId);
    if (label) return label.color;
  }
  return null;
}

function KanbanCard({
  item,
  fields,
  color,
  users,
  onOpen,
}: {
  item: Item;
  fields: Column[];
  color: string | null;
  users: Map<number, User>;
  onOpen: (id: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });
  const theme = useTheme();
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid="kanban-card"
      data-item-id={item.id}
      onClick={() => onOpen(item.id)}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)${isDragging && !reduceMotion ? ' rotate(1deg)' : ''}`
          : undefined,
        borderLeftColor: color ? labelStyle(color, theme).solid : 'var(--line-strong)',
      }}
      className={cn(
        'cursor-grab rounded-pop border border-line border-l-[3px] bg-surface p-3 hover:border-line-strong',
        isDragging && 'shadow-pop motion-reduce:rotate-0',
      )}
    >
      <p className="line-clamp-2 text-sm font-medium text-ink">{item.name}</p>
      {fields.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {fields.map((field) => (
            <span
              key={field.id}
              className="inline-flex max-w-[110px] items-center overflow-hidden rounded-chip bg-surface-2 px-1.5 py-0.5 t-meta text-muted"
            >
              <CellDisplay
                column={field}
                value={item.values[String(field.id)]}
                users={users}
                statusDone={false}
              />
            </span>
          ))}
        </div>
      )}
      {item.updateCount > 0 && (
        <div className="mt-1 flex items-center gap-1 t-meta text-muted">
          <MessageSquare size={10} /> {item.updateCount}
        </div>
      )}
    </div>
  );
}

function LaneColumn({
  lane,
  items,
  fields,
  boardColumns,
  boardId,
  users,
  onCreate,
  onOpen,
}: {
  lane: Lane;
  items: Item[];
  fields: Column[];
  boardColumns: Column[];
  boardId: number;
  users: Map<number, User>;
  onCreate: (lane: Lane, name: string) => void;
  onOpen: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${lane.key}` });
  const theme = useTheme();
  const [name, setName] = useState('');
  return (
    <div className="w-[85vw] shrink-0 snap-start md:w-72">
      <div className="mb-2 flex items-center gap-2 px-1">
        {lane.color ? (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: labelStyle(lane.color, theme).solid }}
          />
        ) : (
          <span className="h-2 w-2 rounded-full border border-line" />
        )}
        <span className="t-label text-ink">{lane.label}</span>
        <span className="rounded-full bg-sunken px-1.5 t-meta text-muted">{items.length}</span>
      </div>
      <div
        ref={setNodeRef}
        data-testid="kanban-lane"
        data-lane-label={lane.label}
        className={cn(
          'min-h-[120px] space-y-2 rounded-[12px] border border-transparent bg-surface-2 p-3',
          isOver && 'border-accent bg-accent-soft',
        )}
      >
        {items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            fields={fields}
            color={statusColor(item, boardColumns)}
            users={users}
            onOpen={onOpen}
          />
        ))}
        <div className="flex items-center gap-1 px-1">
          <Plus size={12} className="text-muted" />
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && name.trim()) {
                onCreate(lane, name.trim());
                setName('');
              }
            }}
            placeholder="Add item"
            className="h-7 w-full bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
          />
        </div>
      </div>
      <div className="hidden">{boardId}</div>
    </div>
  );
}

export function KanbanView({
  full,
  items,
  users,
  boardId,
  view,
  onOpen,
}: {
  full: BoardFull;
  items: Item[];
  users: Map<number, User>;
  boardId: number;
  view: View;
  onOpen: (id: number) => void;
}) {
  const setValue = useSetValue(boardId);
  const createItem = useCreateItem(boardId);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const column =
    full.columns.find((entry) => entry.id === view.settings.kanbanColumnId) ??
    full.columns.find((entry) => ['status', 'dropdown', 'people'].includes(entry.type));

  if (!column) {
    return (
      <div className="p-6 text-sm text-muted">
        Add a Status, Dropdown or People column to use Kanban.
      </div>
    );
  }

  const lanes: Lane[] = [{ key: 'none', label: 'No value', color: null, value: null }];
  if (column.type === 'people') {
    [...users.values()]
      .filter((user) => user.isActive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((user) =>
        lanes.push({ key: String(user.id), label: user.name, color: user.color, value: null }),
      );
  } else {
    const labels =
      (column.type === 'status' ? column.settings.labels : column.settings.options) ?? [];
    labels.forEach((label) =>
      lanes.push({ key: label.id, label: label.name, color: label.color, value: null }),
    );
  }

  const fieldIds =
    view.settings.cardColumnIds && view.settings.cardColumnIds.length
      ? view.settings.cardColumnIds
      : [
          full.columns.find((entry) => entry.type === 'people')?.id,
          full.columns.find((entry) => entry.type === 'date')?.id,
        ].filter(Boolean as unknown as (id: number | undefined) => id is number);
  const fields = full.columns.filter((entry) => fieldIds.includes(entry.id));
  const top = items.filter((item) => item.parentId === null);

  function onDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    if (typeof overId !== 'string' || !overId.startsWith('lane:')) return;
    const key = overId.slice('lane:'.length);
    const itemId = Number(event.active.id);
    const item = top.find((entry) => entry.id === itemId);
    if (!item) return;
    if (itemLaneKey(item, column!) === key) return;
    setValue.mutate({ itemId, columnId: column!.id, value: laneValue(column!, key) });
  }

  function create(lane: Lane, name: string) {
    const group = full.groups[0];
    if (!group) return;
    createItem.mutate({
      groupId: group.id,
      name,
      values:
        lane.key === 'none' ? undefined : { [String(column!.id)]: laneValue(column!, lane.key) },
    });
  }

  return (
    <div className="h-full overflow-auto bg-canvas px-4 py-3">
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex snap-x snap-mandatory gap-3 md:snap-none">
          {lanes.map((lane) => (
            <LaneColumn
              key={lane.key}
              lane={lane}
              items={top.filter((item) => itemLaneKey(item, column) === lane.key)}
              fields={fields}
              boardColumns={full.columns}
              boardId={boardId}
              users={users}
              onCreate={create}
              onOpen={onOpen}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

export type { CellValue };
