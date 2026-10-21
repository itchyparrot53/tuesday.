import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical, Maximize2, MessageSquare } from 'lucide-react';
import type { Column, Item, User } from '../../../shared/types';
import { CellEditor } from './cells/CellEditor';
import { useUpdateItem } from './mutations';
import { cn } from '../lib/cn';
import { labelStyle, useTheme } from '../lib/labelColors';

export function ItemRow({
  item,
  columns,
  groupColor,
  users,
  statusDone,
  boardId,
  onOpen,
  selected,
  onToggleSelect,
  hasChildren,
  expanded,
  onToggleExpand,
  isSubitem,
}: {
  item: Item;
  columns: Column[];
  groupColor: string;
  users: Map<number, User>;
  statusDone: boolean;
  boardId: number;
  onOpen: (id: number, tab?: 'updates' | 'info') => void;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
  hasChildren?: boolean;
  expanded?: boolean;
  onToggleExpand?: (id: number) => void;
  isSubitem?: boolean;
}) {
  const update = useUpdateItem(boardId);
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    const edit = (event: Event) => {
      if ((event as CustomEvent<number>).detail === item.id) setEditing(true);
    };
    window.addEventListener('tuesday:edit-name', edit);
    return () => window.removeEventListener('tuesday:edit-name', edit);
  }, [item.id]);
  const [name, setName] = useState(item.name);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: Boolean(isSubitem),
  });

  function saveName() {
    setEditing(false);
    if (!name.trim() || name === item.name) {
      setName(item.name);
      return;
    }
    update.mutate({ itemId: item.id, name: name.trim() });
  }

  return (
    <div
      ref={setNodeRef}
      data-testid="item-row"
      data-item-id={item.id}
      data-item-name={item.name}
      style={{
        minWidth: 'max-content',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
      className="board-row group flex h-[var(--row-h)] border-b border-line bg-surface hover:bg-surface-2"
    >
      <div
        data-grid-cell
        data-col-index={-1}
        data-column-type="name"
        data-item-id={item.id}
        data-column-title="Item"
        className={cn(
          'sticky left-0 z-10 flex w-[var(--item-w)] shrink-0 items-center gap-1 border-r border-line bg-surface px-1.5 group-hover:bg-canvas',
          isSubitem && 'pl-6',
        )}
        style={{ borderLeft: `4px solid ${labelStyle(groupColor, theme).solid}` }}
      >
        {!isSubitem && (
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab text-muted opacity-0 group-hover:opacity-100"
            aria-label="Drag item"
          >
            <GripVertical size={13} />
          </span>
        )}
        {hasChildren ? (
          <button
            aria-label={expanded ? 'Collapse subitems' : 'Expand subitems'}
            className="text-muted"
            onClick={() => onToggleExpand?.(item.id)}
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className={isSubitem ? '' : 'w-[13px]'} />
        )}
        <input
          type="checkbox"
          aria-label={`Select ${item.name}`}
          className="h-3.5 w-3.5 shrink-0 rounded-chip border-line"
          checked={Boolean(selected)}
          onChange={() => onToggleSelect?.(item.id)}
        />
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName();
              if (e.key === 'Escape') {
                setName(item.name);
                setEditing(false);
              }
            }}
            className="h-7 min-w-0 flex-1 rounded-control border border-accent bg-surface px-1 text-sm outline-none"
          />
        ) : (
          <span
            data-testid="item-name"
            className="min-w-0 flex-1 truncate text-sm font-medium text-ink"
            onDoubleClick={() => setEditing(true)}
            title={item.name}
          >
            {item.name}
          </span>
        )}
        <button
          data-testid="item-open-info"
          aria-label={`Open info for ${item.name}`}
          title="Open item info"
          onClick={() => onOpen(item.id, 'info')}
          className="rounded-control p-0.5 text-muted opacity-0 hover:bg-sunken group-hover:opacity-100"
        >
          <Maximize2 size={12} />
        </button>
        <button
          data-testid="item-open"
          aria-label={`Updates for ${item.name}`}
          title="Open updates"
          onClick={() => onOpen(item.id, 'updates')}
          className="flex h-6 w-6 items-center justify-center gap-0.5 rounded-control t-meta text-muted hover:bg-sunken hover:text-ink"
        >
          <MessageSquare size={12} />
          {item.updateCount > 0 && <span>{item.updateCount}</span>}
        </button>
      </div>
      {columns.map((column, columnIndex) => (
        <div
          key={column.id}
          data-testid="cell"
          data-grid-cell
          data-col-index={columnIndex}
          data-column-id={column.id}
          data-column-type={column.type}
          data-item-id={item.id}
          data-column-title={column.title}
          className={
            column.type === 'status'
              ? 'board-cell flex h-[var(--row-h)] shrink-0 items-center justify-center overflow-hidden border-r border-line text-center'
              : 'board-cell flex h-[var(--row-h)] shrink-0 items-center justify-center overflow-hidden border-r border-line px-[var(--cell-px)] text-center'
          }
          style={{ width: column.width }}
        >
          <CellEditor
            column={column}
            item={item}
            users={users}
            boardId={boardId}
            statusDone={statusDone}
          />
        </div>
      ))}
      <div className="w-11 shrink-0" />
    </div>
  );
}
