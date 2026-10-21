import { useEffect, useState } from 'react';
import {
  BarChart3,
  BatteryFull,
  Check,
  Hash,
  List,
  ShieldAlert,
  Sparkles,
  StickyNote,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input, Textarea } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import type { Widget, WidgetConfig, WidgetType } from '../../../shared/dashboards';
import type { FilterOp } from '../../../shared/types';
import { cn } from '../lib/cn';

const TYPES: {
  type: WidgetType;
  label: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    type: 'number',
    label: 'Number',
    description: 'One big metric, like total items or a sum.',
    icon: Hash,
  },
  {
    type: 'chart',
    label: 'Chart',
    description: 'Bars, pie or line across a status or person.',
    icon: BarChart3,
  },
  {
    type: 'battery',
    label: 'Battery',
    description: 'A split bar showing how work is distributed.',
    icon: BatteryFull,
  },
  {
    type: 'workload',
    label: 'Workload',
    description: 'Who is carrying what, against a capacity line.',
    icon: Users,
  },
  {
    type: 'items',
    label: 'Item list',
    description: 'A short list of the items that matter here.',
    icon: List,
  },
  {
    type: 'note',
    label: 'Note',
    description: 'A written note or instruction on the dashboard.',
    icon: StickyNote,
  },
  {
    type: 'ai_insight',
    label: 'AI insight',
    description: 'A generated read of the boards in plain language.',
    icon: Sparkles,
  },
  {
    type: 'risk',
    label: 'Risks',
    description: 'Late, blocked or at-risk work in one place.',
    icon: ShieldAlert,
  },
];

const DEFAULT_SIZE: Record<WidgetType, { w: Widget['w']; h: Widget['h'] }> = {
  number: { w: 3, h: 1 },
  chart: { w: 6, h: 2 },
  battery: { w: 6, h: 2 },
  workload: { w: 6, h: 2 },
  items: { w: 12, h: 2 },
  note: { w: 4, h: 2 },
  ai_insight: { w: 12, h: 2 },
  risk: { w: 6, h: 2 },
};

const OPS: FilterOp[] = ['is', 'is_not', 'contains', 'is_empty', 'is_not_empty', 'gt', 'lt'];

function TypePreview({ type }: { type: WidgetType }) {
  if (type === 'number') {
    return (
      <span className="flex h-full w-full items-center justify-center">
        <span className="t-title text-ink">42</span>
      </span>
    );
  }
  if (type === 'chart') {
    return (
      <span className="flex h-full w-full items-end justify-center gap-1 px-1">
        {[42, 68, 34, 84].map((height, index) => (
          <span
            key={height}
            className="w-2 rounded-t-[2px] bg-accent"
            style={{ height: `${height}%`, opacity: index === 3 ? 1 : 0.4 }}
          />
        ))}
      </span>
    );
  }
  if (type === 'battery') {
    return (
      <span className="flex h-full w-full flex-col justify-center gap-1.5">
        <span className="flex h-2.5 w-full overflow-hidden rounded-full bg-sunken">
          <span className="w-2/5 bg-success" />
          <span className="w-1/3 bg-warning" />
          <span className="flex-1 bg-accent" />
        </span>
        <span className="t-meta text-muted">12 of 20 done</span>
      </span>
    );
  }
  if (type === 'workload') {
    return (
      <span className="flex h-full w-full flex-col justify-center gap-1.5">
        {[70, 45, 88].map((width, index) => (
          <span key={width} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" style={{ opacity: 1 - index * 0.2 }} />
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${width}%` }}
              />
            </span>
          </span>
        ))}
      </span>
    );
  }
  if (type === 'items') {
    return (
      <span className="flex h-full w-full flex-col justify-center gap-1.5">
        {[80, 62, 72].map((width) => (
          <span key={width} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-[2px] bg-accent" />
            <span className="h-1.5 rounded-full bg-sunken" style={{ width: `${width}%` }} />
          </span>
        ))}
      </span>
    );
  }
  if (type === 'note') {
    return (
      <span className="flex h-full w-full flex-col justify-center gap-1.5">
        {[92, 78, 54].map((width) => (
          <span
            key={width}
            className="h-1.5 rounded-full bg-sunken"
            style={{ width: `${width}%` }}
          />
        ))}
      </span>
    );
  }
  if (type === 'ai_insight') {
    return (
      <span className="flex h-full w-full items-center gap-2">
        <Sparkles size={16} className="shrink-0 text-ai" />
        <span className="h-1.5 flex-1 rounded-full bg-sunken" />
        <span className="h-1.5 w-1/4 rounded-full bg-sunken" />
      </span>
    );
  }
  return (
    <span className="flex h-full w-full flex-col justify-center gap-1.5">
      {[68, 84].map((width) => (
        <span key={width} className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-danger" />
          <span className="h-1.5 rounded-full bg-danger/25" style={{ width: `${width}%` }} />
        </span>
      ))}
    </span>
  );
}

export function WidgetEditor({
  open,
  onOpenChange,
  initial,
  boards,
  columnTitles,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Widget | null;
  boards: { id: number; name: string }[];
  columnTitles: string[];
  onSave: (widget: Widget) => void;
}) {
  const [type, setType] = useState<WidgetType>('number');
  const [title, setTitle] = useState('');
  const [config, setConfig] = useState<WidgetConfig>({});
  const [boardIds, setBoardIds] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    const nextType = initial?.type ?? 'number';
    setType(nextType);
    setTitle(initial?.title ?? TYPES.find((entry) => entry.type === nextType)?.label ?? 'Widget');
    setConfig(initial?.config ?? { metric: 'count' });
    setBoardIds(initial?.config.boardIds ?? []);
  }, [open, initial?.id]);

  function save() {
    const id = initial?.id ?? crypto.randomUUID().slice(0, 8);
    const size = DEFAULT_SIZE[type];
    onSave({
      id,
      type,
      title: title || 'Widget',
      w: initial?.w ?? size.w,
      h: initial?.h ?? size.h,
      config: { ...config, ...(boardIds.length ? { boardIds } : {}) },
    });
    onOpenChange(false);
  }

  const set = (patch: Partial<WidgetConfig>) => setConfig((current) => ({ ...current, ...patch }));

  function chooseType(next: WidgetType) {
    setType(next);
    setTitle(TYPES.find((entry) => entry.type === next)?.label ?? 'Widget');
    setConfig(
      next === 'note' ? { text: '' } : next === 'items' ? { limit: 10 } : { metric: 'count' },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? 'Edit widget' : 'Add widget'}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{initial ? 'Save' : 'Add widget'}</Button>
        </>
      }
    >
      <p className="mb-1.5 t-label font-medium">Type</p>
      <div
        role="radiogroup"
        aria-label="Widget type"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {TYPES.map((entry) => {
          const Icon = entry.icon;
          const selected = entry.type === type;
          return (
            <button
              key={entry.type}
              type="button"
              role="radio"
              aria-checked={selected}
              data-testid={`widget-type-${entry.type}`}
              onClick={() => chooseType(entry.type)}
              className={cn(
                'relative flex min-h-[132px] flex-col gap-2 rounded-control border p-2.5 text-left transition-colors',
                selected
                  ? 'border-accent bg-accent-soft'
                  : 'border-line hover:border-line-strong hover:bg-surface-2',
              )}
            >
              {selected && (
                <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-ink">
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
              <span className="flex h-12 items-center justify-center rounded-[6px] bg-surface-2 px-2 py-1.5">
                <TypePreview type={entry.type} />
              </span>
              <span className="flex items-center gap-1.5 t-label font-semibold text-ink">
                <Icon size={13} className="shrink-0 text-muted" /> {entry.label}
              </span>
              <span className="t-meta leading-snug text-muted">{entry.description}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 max-w-[520px]">
        <label className="mb-1 block t-label font-medium">Title</label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>

      <div className="mt-3">
        <p className="mb-1 t-label font-medium">Boards</p>
        <div className="flex flex-wrap gap-1.5">
          {boards.map((board) => {
            const selected = boardIds.includes(board.id);
            return (
              <button
                key={board.id}
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  setBoardIds((current) =>
                    selected ? current.filter((id) => id !== board.id) : [...current, board.id],
                  )
                }
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 t-meta font-medium transition-colors',
                  selected
                    ? 'border-accent bg-accent-soft text-accent-soft-ink'
                    : 'border-line text-muted hover:border-line-strong hover:text-ink',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    selected ? 'bg-accent' : 'bg-line-strong',
                  )}
                />
                {board.name}
              </button>
            );
          })}
          {boards.length === 0 && <span className="t-meta text-muted">No boards available.</span>}
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {type === 'number' && (
          <>
            <div>
              <label className="mb-1 block t-label font-medium">Metric</label>
              <Select
                ariaLabel="Metric"
                value={config.metric ?? 'count'}
                onChange={(value) => set({ metric: value as 'count' })}
                options={[
                  { value: 'count', label: 'Count' },
                  { value: 'sum', label: 'Sum' },
                  { value: 'avg', label: 'Average' },
                ]}
              />
            </div>
            {(config.metric === 'sum' || config.metric === 'avg') && (
              <div>
                <label className="mb-1 block t-label font-medium">Value column</label>
                <Select
                  ariaLabel="Value column"
                  value={config.valueColumnTitle ?? ''}
                  onChange={(value) => set({ valueColumnTitle: value })}
                  options={[
                    { value: '', label: 'Choose…' },
                    ...columnTitles.map((title) => ({ value: title, label: title })),
                  ]}
                />
              </div>
            )}
          </>
        )}
        {(type === 'chart' || type === 'battery' || type === 'workload') && (
          <>
            {type === 'chart' && (
              <div>
                <label className="mb-1 block t-label font-medium">Group by</label>
                <Select
                  ariaLabel="Group by"
                  value={config.groupBy ?? 'status'}
                  onChange={(value) => set({ groupBy: value as 'status' })}
                  options={[
                    { value: 'status', label: 'Status' },
                    { value: 'people', label: 'People' },
                    { value: 'group', label: 'Group' },
                    { value: 'board', label: 'Board' },
                    { value: 'dropdown', label: 'Dropdown' },
                    { value: 'month', label: 'Month' },
                  ]}
                />
              </div>
            )}
            <div>
              <label className="mb-1 block t-label font-medium">Column</label>
              <Select
                ariaLabel="Column"
                value={config.groupByColumnTitle ?? ''}
                onChange={(value) => set({ groupByColumnTitle: value })}
                options={[
                  { value: '', label: 'First suitable' },
                  ...columnTitles.map((title) => ({ value: title, label: title })),
                ]}
              />
            </div>
            {type === 'chart' && (
              <div>
                <label className="mb-1 block t-label font-medium">Chart kind</label>
                <Select
                  ariaLabel="Chart kind"
                  value={config.chartKind ?? 'bar'}
                  onChange={(value) => set({ chartKind: value as 'bar' })}
                  options={[
                    { value: 'bar', label: 'Bar' },
                    { value: 'pie', label: 'Pie' },
                    { value: 'line', label: 'Line' },
                  ]}
                />
              </div>
            )}
            {type === 'workload' && (
              <div>
                <label className="mb-1 block t-label font-medium">Capacity line</label>
                <Input
                  type="number"
                  value={config.capacity ?? ''}
                  onChange={(event) => set({ capacity: Number(event.target.value) || undefined })}
                />
              </div>
            )}
          </>
        )}
        {type === 'items' && (
          <>
            <div>
              <label className="mb-1 block t-label font-medium">Limit</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={config.limit ?? 10}
                onChange={(event) => set({ limit: Number(event.target.value) })}
              />
            </div>
            <div>
              <label className="mb-1 block t-label font-medium">Sort by column</label>
              <Select
                ariaLabel="Sort by column"
                value={config.sortColumnTitle ?? ''}
                onChange={(value) => set({ sortColumnTitle: value })}
                options={[
                  { value: '', label: 'None' },
                  ...columnTitles.map((title) => ({ value: title, label: title })),
                ]}
              />
            </div>
          </>
        )}
        {type === 'note' && (
          <div className="md:col-span-2">
            <label className="mb-1 block t-label font-medium">Note (Markdown)</label>
            <Textarea
              rows={5}
              maxLength={4000}
              value={config.text ?? ''}
              onChange={(event) => set({ text: event.target.value })}
            />
          </div>
        )}
        {type === 'ai_insight' && (
          <div className="md:col-span-2">
            <label className="mb-1 block t-label font-medium">Focus (optional)</label>
            <Input
              value={config.focus ?? ''}
              maxLength={500}
              onChange={(event) => set({ focus: event.target.value })}
              placeholder="e.g. focus on launch risk"
            />
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="t-label font-medium">Filters</p>
          <button
            className="t-meta text-accent"
            onClick={() =>
              set({
                filters: [
                  ...(config.filters ?? []),
                  { columnTitle: columnTitles[0] ?? '', op: 'is', value: '' },
                ],
              })
            }
          >
            + filter
          </button>
        </div>
        {(config.filters ?? []).map((filter, index) => (
          <div key={index} className="mb-1 flex gap-1">
            <Select
              ariaLabel="Filter column"
              value={filter.columnTitle}
              onChange={(value) =>
                set({
                  filters: (config.filters ?? []).map((entry, i) =>
                    i === index ? { ...entry, columnTitle: value } : entry,
                  ),
                })
              }
              options={columnTitles.map((title) => ({ value: title, label: title }))}
              size="sm"
              className="min-w-0 flex-1"
            />
            <Select
              ariaLabel="Filter operator"
              value={filter.op}
              onChange={(value) =>
                set({
                  filters: (config.filters ?? []).map((entry, i) =>
                    i === index ? { ...entry, op: value as FilterOp } : entry,
                  ),
                })
              }
              options={OPS.map((op) => ({ value: op, label: op }))}
              size="sm"
              className="w-[92px]"
            />
            <Input
              value={String(filter.value ?? '')}
              onChange={(event) =>
                set({
                  filters: (config.filters ?? []).map((entry, i) =>
                    i === index ? { ...entry, value: event.target.value } : entry,
                  ),
                })
              }
              className="h-8 w-28 t-label"
            />
            <button
              className="text-muted hover:text-danger"
              onClick={() => set({ filters: (config.filters ?? []).filter((_, i) => i !== index) })}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
