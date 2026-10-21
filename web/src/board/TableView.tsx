import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import type { BoardFull, Item, User } from '../../../shared/types';
import { GroupSection } from './GroupSection';
import { useCreateGroup, useMoveItem, useUpdateGroup } from './mutations';

export function TableView({
  full,
  items,
  users,
  boardId,
  onOpen,
  hiddenColumnIds = [],
  selected,
  onToggleSelect,
  onSelectGroup,
  onHideColumn,
}: {
  full: BoardFull;
  items: Item[];
  users: Map<number, User>;
  boardId: number;
  onOpen: (id: number) => void;
  hiddenColumnIds?: number[];
  selected: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectGroup: (groupId: number, value: boolean) => void;
  onHideColumn: (columnId: number) => void;
}) {
  const columns = full.columns.filter((c) => !hiddenColumnIds.includes(c.id));
  const move = useMoveItem(boardId);
  const updateGroup = useUpdateGroup(boardId);
  const createGroup = useCreateGroup(boardId);
  const containerRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeItem = items.find((item) => item.id === active.id);
    if (!activeItem || activeItem.parentId !== null) return;
    if (over.id === active.id) return;

    let targetGroupId: number;
    let overItem: Item | undefined;
    if (typeof over.id === 'string' && over.id.startsWith('group-')) {
      targetGroupId = Number(over.id.slice('group-'.length));
    } else {
      overItem = items.find((item) => item.id === over.id);
      if (!overItem) return;
      targetGroupId = overItem.groupId;
    }

    const originalSiblings = items
      .filter((item) => item.groupId === targetGroupId && item.parentId === null)
      .sort((a, b) => a.position - b.position);
    const siblings = originalSiblings.filter((item) => item.id !== activeItem.id);
    const activeIndex = originalSiblings.findIndex((item) => item.id === activeItem.id);
    const overIndex = overItem
      ? originalSiblings.findIndex((item) => item.id === overItem!.id)
      : -1;
    let afterItemId: number | null = null;
    if (overItem) {
      const index = siblings.findIndex((item) => item.id === overItem!.id);
      if (activeIndex !== -1 && activeIndex < overIndex) {
        afterItemId = overItem.id;
      } else {
        afterItemId = index > 0 ? siblings[index - 1].id : null;
      }
    }
    move.mutate({ itemId: activeItem.id, groupId: targetGroupId, afterItemId });
  }

  function collapseAll(collapsed: boolean) {
    for (const group of full.groups) {
      updateGroup.mutate({ groupId: group.id, collapsed });
    }
  }

  function cells(): HTMLElement[] {
    if (!containerRef.current) return [];
    return Array.from(containerRef.current.querySelectorAll<HTMLElement>('[data-grid-cell]'));
  }

  function deactivate() {
    for (const current of cells()) {
      if (!current.dataset.activeCell) continue;
      delete current.dataset.activeCell;
      current.classList.remove('ring-2', 'ring-accent', 'ring-inset', 'relative');
      current.querySelector('[data-testid="cell-active"]')?.remove();
    }
  }

  function activate(element: HTMLElement) {
    for (const current of cells()) {
      if (current === element) continue;
      if (current.dataset.activeCell) {
        delete current.dataset.activeCell;
        current.classList.remove('ring-2', 'ring-accent', 'ring-inset', 'relative');
        current.querySelector('[data-testid="cell-active"]')?.remove();
      }
    }
    element.dataset.activeCell = 'true';
    element.classList.add('ring-2', 'ring-accent', 'ring-inset', 'relative');
    if (!element.querySelector('[data-testid="cell-active"]')) {
      const marker = document.createElement('span');
      marker.dataset.testid = 'cell-active';
      marker.setAttribute('data-testid', 'cell-active');
      marker.dataset.columnTitle = element.dataset.columnTitle ?? '';
      marker.dataset.itemId = element.dataset.itemId ?? '';
      marker.className = 'pointer-events-none absolute inset-0';
      element.appendChild(marker);
    }
    containerRef.current?.focus();
  }

  function moveActive(direction: 'left' | 'right' | 'up' | 'down') {
    const active = containerRef.current?.querySelector<HTMLElement>('[data-active-cell]');
    const all = cells();
    if (!active) {
      if (all[0]) activate(all[0]);
      return;
    }
    const columnIndex = Number(active.dataset.colIndex);
    if (direction === 'left' || direction === 'right') {
      const target = all.find(
        (cell) =>
          cell.dataset.itemId === active.dataset.itemId &&
          Number(cell.dataset.colIndex) === columnIndex + (direction === 'right' ? 1 : -1),
      );
      if (target) activate(target);
    } else {
      const sameColumn = all.filter((cell) => Number(cell.dataset.colIndex) === columnIndex);
      const index = sameColumn.indexOf(active);
      const target = sameColumn[index + (direction === 'down' ? 1 : -1)];
      if (target) activate(target);
    }
  }

  async function clearActive() {
    const active = containerRef.current?.querySelector<HTMLElement>('[data-active-cell]');
    if (!active) return;
    const itemId = Number(active.dataset.itemId);
    const columnId = Number(active.dataset.columnId);
    if (!itemId || !columnId) return;
    await api('PUT', `/items/${itemId}/values/${columnId}`, { value: null });
    await qc.invalidateQueries({ queryKey: ['items', boardId] });
  }

  useEffect(() => {
    let suppressEnterUntil = 0;
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const active = containerRef.current?.querySelector<HTMLElement>('[data-active-cell]');
      if (!active) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveActive('left');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveActive('right');
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveActive('up');
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveActive('down');
      } else if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        suppressEnterUntil = Date.now() + 80;
        if (active.dataset.columnType === 'name') {
          window.dispatchEvent(
            new CustomEvent('tuesday:edit-name', { detail: Number(active.dataset.itemId) }),
          );
        } else {
          active.querySelector<HTMLElement>('button, input')?.click();
        }
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        void clearActive();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        deactivate();
      } else if (
        event.key.length === 1 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (active.dataset.columnType === 'name' ||
          ['text', 'long_text', 'number'].includes(active.dataset.columnType ?? ''))
      ) {
        event.preventDefault();
        if (active.dataset.columnType === 'name') {
          window.dispatchEvent(
            new CustomEvent('tuesday:edit-name', { detail: Number(active.dataset.itemId) }),
          );
        } else {
          active.querySelector<HTMLElement>('button, input')?.click();
        }
        window.setTimeout(() => {
          const input =
            active.dataset.columnType === 'name'
              ? active.querySelector<HTMLInputElement>('input[class*="h-7"]')
              : active.querySelector<HTMLInputElement>('input, textarea');
          if (!input) return;
          const proto =
            input instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          setter?.call(input, event.key);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.focus();
        }, 30);
      }
    }
    document.addEventListener('keydown', onKey);
    const commit = () => moveActive('down');
    window.addEventListener('tuesday:cell-commit', commit);
    function onCommitKey(event: KeyboardEvent) {
      if (event.key !== 'Enter') return;
      const target = event.target as HTMLElement;
      if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      const active = containerRef.current?.querySelector<HTMLElement>('[data-active-cell]');
      if (!active || !active.contains(target)) return;
      window.setTimeout(() => moveActive('down'), 0);
    }
    document.addEventListener('keydown', onCommitKey, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keydown', onCommitKey, true);
      window.removeEventListener('tuesday:cell-commit', commit);
    };
  }, [boardId]);

  return (
    <div
      ref={containerRef}
      data-testid="board-scroll"
      tabIndex={0}
      role="region"
      aria-label="Board table"
      onClick={(event) => {
        const element = (event.target as HTMLElement).closest<HTMLElement>('[data-grid-cell]');
        if (element) activate(element);
      }}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
          const active = containerRef.current?.querySelector<HTMLElement>('[data-active-cell]');
          if (active) {
            void navigator.clipboard.writeText(active.textContent ?? '');
            event.preventDefault();
          }
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
          const active = containerRef.current?.querySelector<HTMLElement>('[data-active-cell]');
          if (!active) return;
          event.preventDefault();
          void navigator.clipboard.readText().then(async (text) => {
            const itemId = Number(active.dataset.itemId);
            const columnId = Number(active.dataset.columnId);
            if (!itemId || !columnId) return;
            await api('PUT', `/items/${itemId}/values/${columnId}/text`, { text });
            await qc.invalidateQueries({ queryKey: ['items', boardId] });
          });
          return;
        }
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          moveActive('left');
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          moveActive('right');
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveActive('up');
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveActive('down');
        } else if (event.key === 'Tab') {
          event.preventDefault();
          moveActive(event.shiftKey ? 'left' : 'right');
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          void clearActive();
        }
      }}
      className="h-full overflow-auto bg-canvas px-0 pb-16 pt-2 outline-none"
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="min-w-max px-4">
          {full.groups.map((group, index) => (
            <GroupSection
              key={group.id}
              group={group}
              columns={columns}
              items={items.filter((item) => item.groupId === group.id && item.parentId === null)}
              allItems={items.filter((item) => item.groupId === group.id)}
              users={users}
              boardId={boardId}
              isFirst={index === 0}
              onOpen={onOpen}
              selected={selected}
              onToggleSelect={onToggleSelect}
              onSelectGroup={onSelectGroup}
              onCollapseAll={collapseAll}
              onHideColumn={onHideColumn}
            />
          ))}
        </div>
      </DndContext>
      <button
        className="mt-2 flex h-[var(--row-h)] items-center gap-1 rounded-control px-2 text-sm text-muted hover:bg-sunken hover:text-ink"
        onClick={() => createGroup.mutate({ title: 'New group', at: 'bottom' })}
      >
        <Plus size={14} /> Add new group
      </button>
    </div>
  );
}
