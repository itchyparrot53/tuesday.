import { useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import type { Column, Group, Item, User } from '../../../shared/types';
import { isDoneValue } from '../../../shared/columns';
import { ColumnHeader } from './ColumnHeader';
import { ItemRow } from './ItemRow';
import { AddColumnMenu } from './AddColumnMenu';
import { Dialog } from '../components/ui/Dialog';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu';
import { ColorPicker } from '../components/ui/ColorPicker';
import { labelStyle, useTheme } from '../lib/labelColors';
import { useCreateGroup, useCreateItem, useDeleteGroup, useUpdateGroup } from './mutations';

function isDone(item: Item, columns: Column[]): boolean {
  return columns
    .filter((column) => column.type === 'status')
    .some((column) => isDoneValue(column, item.values[String(column.id)]));
}

export function GroupSection({
  group,
  columns,
  items,
  allItems,
  users,
  boardId,
  isFirst,
  onOpen,
  selected,
  onToggleSelect,
  onSelectGroup,
  onCollapseAll,
  onHideColumn,
}: {
  group: Group;
  columns: Column[];
  items: Item[];
  allItems: Item[];
  users: Map<number, User>;
  boardId: number;
  isFirst: boolean;
  onOpen: (id: number) => void;
  selected: Set<number>;
  onToggleSelect: (id: number) => void;
  onSelectGroup: (groupId: number, value: boolean) => void;
  onCollapseAll: (collapsed: boolean) => void;
  onHideColumn: (columnId: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(group.collapsed);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(group.title);
  const [colourOpen, setColourOpen] = useState(false);
  const [colour, setColour] = useState(group.color);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [subFor, setSubFor] = useState<number | null>(null);
  const [subName, setSubName] = useState('');
  const itemInput = useRef<HTMLInputElement>(null);
  const updateGroup = useUpdateGroup(boardId);
  const theme = useTheme();
  const createGroup = useCreateGroup(boardId);
  const deleteGroup = useDeleteGroup(boardId);
  const createItem = useCreateItem(boardId);
  const { setNodeRef, isOver } = useDroppable({ id: `group-${group.id}` });

  const topItems = items.filter((item) => item.parentId === null);
  const allSelected = topItems.length > 0 && topItems.every((item) => selected.has(item.id));

  function addItem() {
    const name = newItem.trim();
    if (!name) return;
    setNewItem('');
    createItem.mutate({ groupId: group.id, name, at: 'bottom' });
    itemInput.current?.focus();
  }

  function addSubitem(parentId: number) {
    const name = subName.trim();
    if (!name) return;
    setSubName('');
    createItem.mutate({ groupId: group.id, name, parentId, at: 'bottom' });
  }

  return (
    <div className="mb-4 last:mb-0">
      <div
        ref={setNodeRef}
        data-testid="group-header"
        data-group-title={group.title}
        className={`group flex h-10 items-center gap-1 bg-canvas pr-2 ${isOver ? 'bg-accent-soft' : ''}`}
        style={{ borderLeft: `4px solid ${labelStyle(group.color, theme).solid}` }}
      >
        <button
          aria-label={collapsed ? 'Expand group' : 'Collapse group'}
          className="ml-1 rounded-control p-0.5 text-muted hover:bg-sunken"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
        <input
          type="checkbox"
          aria-label={`Select all in ${group.title}`}
          className="h-3.5 w-3.5"
          checked={allSelected}
          onChange={(e) => onSelectGroup(group.id, e.target.checked)}
        />
        {renaming ? (
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              setRenaming(false);
              if (title.trim() && title !== group.title) {
                updateGroup.mutate({ groupId: group.id, title: title.trim() });
              } else {
                setTitle(group.title);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setTitle(group.title);
                setRenaming(false);
              }
            }}
            className="h-7 w-[200px] rounded-control border border-accent bg-surface px-1 text-sm font-semibold outline-none"
            style={{ color: 'var(--ink)' }}
          />
        ) : (
          <>
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: labelStyle(group.color, theme).solid }}
            />
            <span className="cursor-text t-section text-ink" onClick={() => setRenaming(true)}>
              {group.title}
            </span>
          </>
        )}
        <span className="ml-1 rounded-full bg-sunken px-1.5 t-meta text-muted">{items.length}</span>
        <Menu
          trigger={
            <button
              aria-label={`Group menu for ${group.title}`}
              className="ml-1 rounded-control p-0.5 text-muted opacity-0 hover:bg-sunken group-hover:opacity-100"
            >
              <MoreHorizontal size={15} />
            </button>
          }
        >
          <MenuItem onSelect={() => setRenaming(true)}>Rename</MenuItem>
          <MenuItem onSelect={() => setColourOpen(true)}>Change colour</MenuItem>
          <MenuItem
            onSelect={() => {
              const next = !collapsed;
              setCollapsed(next);
              onCollapseAll(next);
            }}
          >
            {collapsed ? 'Expand all groups' : 'Collapse all groups'}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onSelect={async () => {
              const created = await createGroup.mutateAsync({ title: 'New group' });
              await updateGroup.mutateAsync({
                groupId: created.group.id,
                afterGroupId: group.id,
              });
            }}
          >
            <Plus size={13} /> Add group below
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger onSelect={() => setDeleteOpen(true)}>
            Delete group
          </MenuItem>
        </Menu>
      </div>

      {!collapsed && (
        <>
          <div
            className="group sticky top-0 z-20 flex h-8 border-b border-line bg-surface-2"
            style={{ minWidth: 'max-content' }}
          >
            <div
              className="sticky left-0 z-30 flex w-[var(--item-w)] shrink-0 items-center border-r border-line bg-surface px-2 t-meta font-medium text-muted"
              style={{ borderLeft: `4px solid ${labelStyle(group.color, theme).solid}` }}
            >
              Item
            </div>
            {columns.map((column) => (
              <ColumnHeader
                key={column.id}
                column={column}
                boardId={boardId}
                columns={columns}
                onHide={onHideColumn}
              />
            ))}
            <div className="flex w-11 shrink-0 items-center justify-center bg-surface">
              {isFirst && <AddColumnMenu boardId={boardId} columns={columns} />}
            </div>
          </div>

          <SortableContext
            items={allItems.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            {topItems.map((item) => {
              const children = allItems.filter((child) => child.parentId === item.id);
              const isExpanded = expanded.has(item.id);
              return (
                <div key={item.id}>
                  <ItemRow
                    item={item}
                    columns={columns}
                    groupColor={group.color}
                    users={users}
                    statusDone={isDone(item, columns)}
                    boardId={boardId}
                    onOpen={onOpen}
                    selected={selected.has(item.id)}
                    onToggleSelect={onToggleSelect}
                    hasChildren={children.length > 0}
                    expanded={isExpanded}
                    onToggleExpand={(id) =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                  />
                  {isExpanded &&
                    children.map((child) => (
                      <ItemRow
                        key={child.id}
                        item={child}
                        columns={columns}
                        groupColor={group.color}
                        users={users}
                        statusDone={isDone(child, columns)}
                        boardId={boardId}
                        onOpen={onOpen}
                        isSubitem
                      />
                    ))}
                  {isExpanded && (
                    <div
                      className="flex h-8 items-center bg-surface pl-8"
                      style={{
                        borderLeft: `4px solid ${labelStyle(group.color, theme).solid}`,
                        minWidth: 'max-content',
                      }}
                    >
                      {subFor === item.id ? (
                        <input
                          autoFocus
                          value={subName}
                          onChange={(e) => setSubName(e.target.value)}
                          onBlur={() => {
                            if (!subName.trim()) setSubFor(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addSubitem(item.id);
                            if (e.key === 'Escape') {
                              setSubName('');
                              setSubFor(null);
                            }
                          }}
                          placeholder="Subitem name"
                          className="h-7 w-[300px] rounded-control border border-accent bg-surface px-2 text-sm outline-none"
                        />
                      ) : (
                        <button
                          className="t-meta text-muted hover:text-ink"
                          onClick={() => {
                            setSubFor(item.id);
                            setSubName('');
                          }}
                        >
                          + Add subitem
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </SortableContext>

          {items.length === 0 && (
            <div
              className="flex h-[var(--row-h)] items-center border-b border-line bg-surface"
              style={{ minWidth: 'max-content' }}
            >
              <div
                className="sticky left-0 flex w-[var(--item-w)] shrink-0 items-center px-3 t-meta text-muted"
                style={{ borderLeft: `4px solid ${labelStyle(group.color, theme).solid}` }}
              >
                No items yet. Add the first one below.
              </div>
            </div>
          )}

          <div
            className="flex h-[var(--row-h)] border-b border-line bg-surface"
            style={{ minWidth: 'max-content' }}
          >
            <div
              className="sticky left-0 z-10 flex w-[var(--item-w)] shrink-0 items-center gap-1 border-r border-line bg-surface px-2"
              style={{ borderLeft: `4px solid ${labelStyle(group.color, theme).solid}` }}
            >
              <span className="w-3.5" />
              <input
                ref={itemInput}
                data-testid="add-item-input"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addItem();
                  if (e.key === 'Escape') setNewItem('');
                }}
                placeholder="+ Add item"
                className="h-7 w-full bg-transparent pl-1 text-sm text-ink placeholder:text-muted focus:outline-none"
              />
            </div>
            {columns.map((column) => (
              <div
                key={column.id}
                className="shrink-0 border-r border-line"
                style={{ width: column.width }}
              />
            ))}
            <div className="w-11" />
          </div>

          <GroupFooter group={group} columns={columns} items={allItems} />
        </>
      )}

      <Dialog
        open={colourOpen}
        onOpenChange={setColourOpen}
        title="Group colour"
        footer={
          <>
            <Button variant="secondary" onClick={() => setColourOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                updateGroup.mutate({ groupId: group.id, color: colour });
                setColourOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <ColorPicker value={colour} onChange={setColour} />
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete group"
        description={`Delete group and ${items.length} item${items.length === 1 ? '' : 's'}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                deleteGroup.mutate(group.id);
                setDeleteOpen(false);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">The items in this group will be deleted.</p>
      </Dialog>
    </div>
  );
}

function GroupFooter({
  group,
  columns,
  items,
}: {
  group: Group;
  columns: Column[];
  items: Item[];
}) {
  const theme = useTheme();
  return (
    <div
      className="flex h-8 border-b border-line bg-canvas/60 t-meta text-muted"
      style={{
        minWidth: 'max-content',
        borderLeft: `4px solid ${labelStyle(group.color, theme).solid}`,
      }}
    >
      <div className="sticky left-0 z-10 flex w-[var(--item-w)] shrink-0 items-center gap-1 border-r border-line bg-canvas px-3">
        <span>Summary</span>
      </div>
      {columns.map((column) => {
        if (column.type === 'status') {
          const labels = column.settings.labels ?? [];
          const counts = labels.map(
            (label) =>
              items.filter((item) => {
                const value = item.values[String(column.id)] as { labelId?: string } | undefined;
                return value?.labelId === label.id;
              }).length,
          );
          const total = counts.reduce((a, b) => a + b, 0);
          return (
            <div
              key={column.id}
              className="flex shrink-0 items-center border-r border-line px-2"
              style={{ width: column.width }}
            >
              {total > 0 && (
                <div
                  className="flex h-1.5 w-full overflow-hidden rounded-full"
                  title={labels.map((l, i) => `${l.name}: ${counts[i]}`).join(' · ')}
                >
                  {labels.map((label, i) =>
                    counts[i] > 0 ? (
                      <span
                        key={label.id}
                        style={{
                          backgroundColor: labelStyle(label.color, theme).solid,
                          width: `${(counts[i] / total) * 100}%`,
                        }}
                      />
                    ) : null,
                  )}
                </div>
              )}
            </div>
          );
        }
        if (column.type === 'number') {
          const sum = items.reduce((acc, item) => {
            const value = item.values[String(column.id)] as { number?: number } | undefined;
            return acc + (value?.number ?? 0);
          }, 0);
          return (
            <div
              key={column.id}
              className="flex shrink-0 items-center justify-end border-r border-line px-2"
              style={{ width: column.width }}
            >
              {sum ? sum.toFixed(column.settings.decimals ?? 0) : ''}
            </div>
          );
        }
        return (
          <div
            key={column.id}
            className="shrink-0 border-r border-line"
            style={{ width: column.width }}
          />
        );
      })}
      <div className="w-11" />
    </div>
  );
}
