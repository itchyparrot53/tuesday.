import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownAZ,
  Filter as FilterIcon,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Rows2,
  Rows3,
  UserRound,
  X,
} from 'lucide-react';
import type { BoardFull, FilterOp, User, View, ViewSettings } from '../../../shared/types';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Popover } from '../components/ui/Popover';
import { Select } from '../components/ui/Select';
import { Avatar } from '../components/ui/Avatar';
import { useCreateItem, useUpdateView } from './mutations';
import { cn } from '../lib/cn';
import { useMe } from '../hooks/useMe';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { applyPrefs } from '../lib/prefs';
import { Segmented } from '../components/ui/Tabs';
import { AiFilterBar } from './AiFilterBar';

const OPS: Record<string, FilterOp[]> = {
  text: ['contains', 'is', 'is_not', 'is_empty', 'is_not_empty'],
  long_text: ['contains', 'is', 'is_not', 'is_empty', 'is_not_empty'],
  email: ['contains', 'is', 'is_not', 'is_empty', 'is_not_empty'],
  phone: ['contains', 'is', 'is_not', 'is_empty', 'is_not_empty'],
  link: ['contains', 'is', 'is_not', 'is_empty', 'is_not_empty'],
  number: ['is', 'gt', 'lt', 'is_empty', 'is_not_empty'],
  rating: ['is', 'gt', 'lt', 'is_empty', 'is_not_empty'],
  status: ['is', 'is_not', 'is_empty', 'is_not_empty'],
  dropdown: ['is', 'is_not', 'is_empty', 'is_not_empty'],
  people: ['is', 'is_not', 'is_empty', 'is_not_empty'],
  date: ['is', 'gt', 'lt', 'is_empty', 'is_not_empty'],
  timeline: ['is', 'is_not', 'is_empty', 'is_not_empty'],
  checkbox: ['is', 'is_not'],
  ai: ['contains', 'is', 'is_not', 'is_empty', 'is_not_empty'],
};

const OP_LABELS: Record<FilterOp, string> = {
  is: 'is',
  is_not: 'is not',
  contains: 'contains',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  gt: 'is greater than',
  lt: 'is less than',
};

export function BoardToolbar({
  boardId,
  full,
  view,
  settings,
  onChange,
  users,
  aiFilterActive = false,
  onAiFilterChange,
}: {
  boardId: number;
  full: BoardFull;
  view: View;
  settings: ViewSettings;
  onChange: (settings: ViewSettings) => void;
  users: Map<number, User>;
  aiFilterActive?: boolean;
  onAiFilterChange?: (active: boolean) => void;
}) {
  const me = useMe();
  const qc = useQueryClient();
  const updateView = useUpdateView(boardId);
  const createItem = useCreateItem(boardId);
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const skip = useRef(true);

  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    if (aiFilterActive) return;
    const timer = window.setTimeout(() => {
      updateView.mutate({ viewId: view.id, settings: { ...settings } });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [settings, view.id, aiFilterActive]);

  function patch(partial: Partial<ViewSettings>) {
    onChange({ ...settings, ...partial });
  }

  const toggleClass = (active: boolean) =>
    cn(
      'inline-flex h-8 items-center gap-1.5 rounded-control border px-2 text-sm',
      active
        ? 'border-accent bg-accent-soft text-accent-soft-ink'
        : 'border-line text-ink hover:bg-surface-2',
    );

  function addFilter() {
    const column = full.columns[0];
    if (!column) return;
    const firstOp = (OPS[column.type] ?? ['contains'])[0];
    patch({
      filters: [...settings.filters, { columnId: column.id, op: firstOp, value: '' }],
    });
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-5">
      <Button
        size="sm"
        icon={<Plus size={14} />}
        onClick={() => {
          const group = full.groups[0];
          if (group) createItem.mutate({ groupId: group.id, name: 'New item', at: 'top' });
        }}
      >
        New item
      </Button>

      <Button
        variant="secondary"
        size="sm"
        className="md:hidden"
        icon={<FilterIcon size={14} />}
        onClick={() => setMobileOpen(true)}
      >
        Filters
      </Button>

      <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
        <AiFilterBar
          boardId={boardId}
          settings={settings}
          onChange={onChange}
          onActiveChange={onAiFilterChange}
        />
        <div className="relative ml-1 w-[220px]">
          <Search size={14} className="pointer-events-none absolute left-2 top-2.5 text-muted" />
          <input
            data-testid="toolbar-search"
            value={settings.search}
            onChange={(e) => patch({ search: e.target.value })}
            placeholder="Search this board"
            className="h-8 w-full rounded-control border border-line bg-canvas pl-7 pr-2 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <Popover
          className="w-[240px]"
          trigger={
            <button className={toggleClass(Boolean(settings.personUserId))}>
              <UserRound size={14} />
              Person
            </button>
          }
        >
          <button
            className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm hover:bg-sunken"
            onClick={() => patch({ personUserId: null })}
          >
            Anyone
          </button>
          <div className="max-h-[260px] overflow-auto">
            {[...users.values()]
              .filter((user) => user.isActive)
              .map((user) => (
                <button
                  key={user.id}
                  onClick={() => patch({ personUserId: user.id })}
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm hover:bg-sunken"
                >
                  <Avatar name={user.name} color={user.color} size={20} />
                  <span className="truncate">{user.name}</span>
                  {settings.personUserId === user.id && (
                    <span className="ml-auto text-accent">✓</span>
                  )}
                </button>
              ))}
          </div>
        </Popover>

        <Popover
          open={addFilterOpen}
          onOpenChange={setAddFilterOpen}
          className="w-[380px]"
          trigger={
            <button className={toggleClass(settings.filters.length > 0)}>
              <FilterIcon size={14} />
              Filter
              {settings.filters.length > 0 && (
                <span className="rounded-full bg-accent-soft px-1.5 t-meta text-accent">
                  {settings.filters.length}
                </span>
              )}
            </button>
          }
        >
          <div className="space-y-2">
            {settings.filters.map((filter, index) => {
              const column = full.columns.find((c) => c.id === filter.columnId);
              const ops: FilterOp[] = column ? (OPS[column.type] ?? ['contains']) : ['contains'];
              return (
                <div key={index} className="space-y-1 rounded-control border border-line p-1.5">
                  <div className="flex gap-1">
                    <Select
                      ariaLabel="Filter column"
                      value={String(filter.columnId)}
                      onChange={(value) => {
                        const next = [...settings.filters];
                        next[index] = { ...filter, columnId: Number(value), value: '' };
                        patch({ filters: next });
                      }}
                      options={full.columns.map((c) => ({ value: String(c.id), label: c.title }))}
                      size="sm"
                      className="min-w-0 flex-1"
                    />
                    <Select
                      ariaLabel="Filter operator"
                      value={filter.op}
                      onChange={(value) => {
                        const next = [...settings.filters];
                        next[index] = { ...filter, op: value as FilterOp };
                        patch({ filters: next });
                      }}
                      options={ops.map((op) => ({ value: op, label: OP_LABELS[op] }))}
                      size="sm"
                      className="w-[110px]"
                    />
                    <button
                      aria-label="Remove filter"
                      title="Remove filter"
                      className="rounded-control p-1 text-muted hover:text-danger"
                      onClick={() =>
                        patch({ filters: settings.filters.filter((_, i) => i !== index) })
                      }
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {!['is_empty', 'is_not_empty'].includes(filter.op) && column && (
                    <FilterValue
                      column={column}
                      value={filter.value}
                      users={users}
                      onChange={(value) => {
                        const next = [...settings.filters];
                        next[index] = { ...filter, value };
                        patch({ filters: next });
                      }}
                    />
                  )}
                </div>
              );
            })}
            <div className="flex justify-between pt-1">
              <Button variant="ghost" size="sm" icon={<Plus size={13} />} onClick={addFilter}>
                Add filter
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => patch({ filters: [] })}
                disabled={!settings.filters.length}
              >
                Clear all
              </Button>
            </div>
          </div>
        </Popover>

        <Popover
          className="w-[240px]"
          trigger={
            <button className={toggleClass(Boolean(settings.sort))}>
              <ArrowDownAZ size={14} />
              Sort
            </button>
          }
        >
          <div className="space-y-2 p-1">
            <Select
              ariaLabel="Sort by"
              value={settings.sort ? String(settings.sort.columnId) : ''}
              onChange={(value) =>
                patch({
                  sort: value
                    ? {
                        columnId: value === 'name' ? 'name' : Number(value),
                        dir: settings.sort?.dir ?? 'asc',
                      }
                    : null,
                })
              }
              options={[
                { value: '', label: 'No sorting' },
                { value: 'name', label: 'Item name' },
                ...full.columns.map((column) => ({
                  value: String(column.id),
                  label: column.title,
                })),
              ]}
              size="sm"
            />
            {settings.sort && (
              <Select
                ariaLabel="Sort direction"
                value={settings.sort.dir}
                onChange={(value) =>
                  patch({
                    sort: { ...settings.sort!, dir: value as 'asc' | 'desc' },
                  })
                }
                options={[
                  { value: 'asc', label: 'Ascending' },
                  { value: 'desc', label: 'Descending' },
                ]}
                size="sm"
              />
            )}
          </div>
        </Popover>

        <Popover
          className="w-[260px]"
          trigger={
            <button className={toggleClass(settings.hiddenColumnIds.length > 0)}>
              <SlidersHorizontal size={14} />
              Hide
            </button>
          }
        >
          <div className="max-h-[300px] space-y-1 overflow-auto">
            {full.columns.map((column) => (
              <label
                key={column.id}
                className="flex items-center gap-2 rounded-control px-1 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={settings.hiddenColumnIds.includes(column.id)}
                  onChange={(e) =>
                    patch({
                      hiddenColumnIds: e.target.checked
                        ? [...settings.hiddenColumnIds, column.id]
                        : settings.hiddenColumnIds.filter((id) => id !== column.id),
                    })
                  }
                />
                {column.title}
              </label>
            ))}
          </div>
        </Popover>

        {view.type !== 'table' && (
          <Popover
            className="w-[260px]"
            trigger={
              <button
                aria-label="View settings"
                className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line px-2 text-sm text-ink"
              >
                <Settings2 size={14} />
                Settings
              </button>
            }
          >
            <div className="space-y-2 p-1">
              {view.type === 'kanban' && (
                <>
                  <label className="block t-meta font-medium text-muted">Group by</label>
                  <Select
                    ariaLabel="Group kanban by"
                    value={settings.kanbanColumnId ? String(settings.kanbanColumnId) : ''}
                    onChange={(value) => patch({ kanbanColumnId: Number(value) })}
                    options={full.columns
                      .filter((column) => ['status', 'dropdown', 'people'].includes(column.type))
                      .map((column) => ({
                        value: String(column.id),
                        label: column.title,
                      }))}
                    placeholder="Choose a column"
                    size="sm"
                  />
                  <label className="block t-meta font-medium text-muted">Card fields</label>
                  <div className="max-h-[160px] space-y-1 overflow-auto">
                    {full.columns.map((column) => (
                      <label key={column.id} className="flex items-center gap-2 t-meta">
                        <input
                          type="checkbox"
                          checked={(settings.cardColumnIds ?? []).includes(column.id)}
                          onChange={(e) =>
                            patch({
                              cardColumnIds: e.target.checked
                                ? [...(settings.cardColumnIds ?? []), column.id]
                                : (settings.cardColumnIds ?? []).filter((id) => id !== column.id),
                            })
                          }
                        />
                        {column.title}
                      </label>
                    ))}
                  </div>
                </>
              )}
              {view.type === 'calendar' && (
                <>
                  <label className="block t-meta font-medium text-muted">Date column</label>
                  <Select
                    ariaLabel="Calendar date column"
                    value={settings.calendarColumnId ? String(settings.calendarColumnId) : ''}
                    onChange={(value) => patch({ calendarColumnId: Number(value) })}
                    options={full.columns
                      .filter((column) => ['date', 'timeline'].includes(column.type))
                      .map((column) => ({
                        value: String(column.id),
                        label: column.title,
                      }))}
                    placeholder="Choose a column"
                    size="sm"
                  />
                </>
              )}
              {view.type === 'timeline' && (
                <>
                  <label className="block t-meta font-medium text-muted">Date column</label>
                  <Select
                    ariaLabel="Timeline column"
                    value={settings.timelineColumnId ? String(settings.timelineColumnId) : ''}
                    onChange={(value) => patch({ timelineColumnId: Number(value) })}
                    options={full.columns
                      .filter((column) => ['timeline', 'date'].includes(column.type))
                      .map((column) => ({
                        value: String(column.id),
                        label: column.title,
                      }))}
                    placeholder="Choose a column"
                    size="sm"
                  />
                  <label className="block t-meta font-medium text-muted">Zoom</label>
                  <Select
                    ariaLabel="Timeline zoom"
                    value={settings.timelineZoom ?? 'month'}
                    onChange={(value) =>
                      patch({ timelineZoom: value as 'week' | 'month' | 'quarter' })
                    }
                    options={[
                      { value: 'week', label: 'Week' },
                      { value: 'month', label: 'Month' },
                      { value: 'quarter', label: 'Quarter' },
                    ]}
                    size="sm"
                  />
                </>
              )}
            </div>
          </Popover>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Segmented
            label="Density"
            value={me.data?.user.preferences.density ?? 'comfortable'}
            options={[
              { id: 'comfortable', title: 'Comfortable density', label: <Rows3 size={13} /> },
              { id: 'compact', title: 'Compact density', label: <Rows2 size={13} /> },
            ]}
            onChange={async (density) => {
              if (!me.data) return;
              applyPrefs({ ...me.data.user.preferences, density });
              await api('PATCH', '/me', { preferences: { density } });
              await qc.invalidateQueries({ queryKey: ['me'] });
            }}
          />
        </div>
      </div>
      <Dialog
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        title="Board filters"
        footer={<Button onClick={() => setMobileOpen(false)}>Done</Button>}
      >
        <label htmlFor="mobile-search" className="t-label mb-1 block text-ink">
          Search
        </label>
        <input
          id="mobile-search"
          value={settings.search}
          onChange={(e) => patch({ search: e.target.value })}
          placeholder="Search this board"
          className="mb-3 h-9 w-full rounded-control border border-line bg-surface px-2 text-sm"
        />

        <span className="t-label mb-1 block text-ink">Person</span>
        <Select
          ariaLabel="Filter person"
          value={settings.personUserId ? String(settings.personUserId) : ''}
          onChange={(value) => patch({ personUserId: value ? Number(value) : null })}
          options={[
            { value: '', label: 'Anyone' },
            ...[...users.values()]
              .filter((user) => user.isActive)
              .map((user) => ({ value: String(user.id), label: user.name })),
          ]}
          size="sm"
          className="mb-3"
        />

        <div className="mb-1 flex items-center justify-between">
          <span className="t-label text-ink">Filters</span>
          <Button variant="ghost" size="sm" onClick={addFilter} icon={<Plus size={13} />}>
            Add filter
          </Button>
        </div>
        <div className="mb-3 space-y-2">
          {settings.filters.map((filter, index) => {
            const column = full.columns.find((c) => c.id === filter.columnId);
            const ops: FilterOp[] = column ? (OPS[column.type] ?? ['contains']) : ['contains'];
            return (
              <div key={index} className="space-y-1 rounded-control border border-line p-2">
                <div className="flex gap-1">
                  <Select
                    ariaLabel="Filter column"
                    value={String(filter.columnId)}
                    onChange={(value) => {
                      const next = [...settings.filters];
                      next[index] = { ...filter, columnId: Number(value), value: '' };
                      patch({ filters: next });
                    }}
                    options={full.columns.map((c) => ({ value: String(c.id), label: c.title }))}
                    size="sm"
                    className="min-w-0 flex-1"
                  />
                  <Select
                    ariaLabel="Filter operator"
                    value={filter.op}
                    onChange={(value) => {
                      const next = [...settings.filters];
                      next[index] = { ...filter, op: value as FilterOp };
                      patch({ filters: next });
                    }}
                    options={ops.map((op) => ({ value: op, label: OP_LABELS[op] }))}
                    size="sm"
                    className="w-[110px]"
                  />
                  <button
                    aria-label="Remove filter"
                    title="Remove filter"
                    className="rounded-control p-1 text-muted hover:text-danger"
                    onClick={() =>
                      patch({ filters: settings.filters.filter((_, i) => i !== index) })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
                {!['is_empty', 'is_not_empty'].includes(filter.op) && column && (
                  <FilterValue
                    column={column}
                    value={filter.value}
                    users={users}
                    onChange={(value) => {
                      const next = [...settings.filters];
                      next[index] = { ...filter, value };
                      patch({ filters: next });
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <span className="t-label mb-1 block text-ink">Sort</span>
        <Select
          ariaLabel="Sort by"
          value={settings.sort ? String(settings.sort.columnId) : ''}
          onChange={(value) =>
            patch({
              sort: value
                ? {
                    columnId: value === 'name' ? 'name' : Number(value),
                    dir: settings.sort?.dir ?? 'asc',
                  }
                : null,
            })
          }
          options={[
            { value: '', label: 'No sorting' },
            { value: 'name', label: 'Item name' },
            ...full.columns.map((column) => ({
              value: String(column.id),
              label: column.title,
            })),
          ]}
          size="sm"
          className="mb-2"
        />
        {settings.sort && (
          <Select
            ariaLabel="Sort direction"
            value={settings.sort.dir}
            onChange={(value) =>
              patch({ sort: { ...settings.sort!, dir: value as 'asc' | 'desc' } })
            }
            options={[
              { value: 'asc', label: 'Ascending' },
              { value: 'desc', label: 'Descending' },
            ]}
            size="sm"
            className="mb-3"
          />
        )}

        <p className="t-label mb-1 text-ink">Hidden columns</p>
        <div className="max-h-[180px] space-y-1 overflow-auto">
          {full.columns.map((column) => (
            <label key={column.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.hiddenColumnIds.includes(column.id)}
                onChange={(e) =>
                  patch({
                    hiddenColumnIds: e.target.checked
                      ? [...settings.hiddenColumnIds, column.id]
                      : settings.hiddenColumnIds.filter((id) => id !== column.id),
                  })
                }
              />
              {column.title}
            </label>
          ))}
        </div>
      </Dialog>
    </div>
  );
}

function FilterValue({
  column,
  value,
  users,
  onChange,
}: {
  column: BoardFull['columns'][number];
  value: string | number | null;
  users: Map<number, User>;
  onChange: (value: string | number | null) => void;
}) {
  if (column.type === 'status') {
    return (
      <Select
        ariaLabel="Filter value"
        value={String(value ?? '')}
        onChange={(next) => onChange(next)}
        options={[
          { value: '', label: 'Choose…' },
          ...(column.settings.labels ?? []).map((label) => ({
            value: label.id,
            label: label.name,
          })),
        ]}
        size="sm"
      />
    );
  }
  if (column.type === 'dropdown') {
    return (
      <Select
        ariaLabel="Filter value"
        value={String(value ?? '')}
        onChange={(next) => onChange(next)}
        options={[
          { value: '', label: 'Choose…' },
          ...(column.settings.options ?? []).map((option) => ({
            value: option.id,
            label: option.name,
          })),
        ]}
        size="sm"
      />
    );
  }
  if (column.type === 'people') {
    return (
      <Select
        ariaLabel="Filter value"
        value={String(value ?? '')}
        onChange={(next) => onChange(next ? Number(next) : null)}
        options={[
          { value: '', label: 'Choose…' },
          ...[...users.values()].map((user) => ({
            value: String(user.id),
            label: user.name,
          })),
        ]}
        size="sm"
      />
    );
  }
  if (column.type === 'checkbox') {
    return (
      <Select
        ariaLabel="Filter value"
        value={String(value ?? '')}
        onChange={(next) => onChange(next)}
        options={[
          { value: '', label: 'Choose…' },
          { value: 'yes', label: 'Checked' },
          { value: 'no', label: 'Unchecked' },
        ]}
        size="sm"
      />
    );
  }
  return (
    <Input
      type={column.type === 'number' || column.type === 'rating' ? 'number' : 'text'}
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 t-meta"
    />
  );
}
