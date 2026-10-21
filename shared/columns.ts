import { z } from 'zod';

export const COLUMN_TYPES = [
  'text',
  'long_text',
  'number',
  'status',
  'dropdown',
  'people',
  'date',
  'timeline',
  'checkbox',
  'link',
  'email',
  'phone',
  'rating',
  'ai',
  'formula',
  'dependency',
  'connect',
  'mirror',
  'time_tracking',
  'file',
] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const PALETTE = [
  '#2BB673',
  '#F5A524',
  '#E5484D',
  '#3E8EF7',
  '#8E59FF',
  '#FF6FB1',
  '#14B8A6',
  '#9CA3AF',
  '#EAB308',
  '#6366F1',
  '#F97316',
  '#84CC16',
] as const;

export interface Label {
  id: string;
  name: string;
  color: string;
}

export interface ColumnSettings {
  labels?: Label[];
  options?: Label[];
  unit?: string;
  unitPosition?: 'prefix' | 'suffix';
  decimals?: number;
  max?: number;
  includeTime?: boolean;
  prompt?: string;
  model?: string;
  autoRun?: boolean;
  output?: 'text' | 'label';
  doneLabelIds?: string[];
  expression?: string;
  format?: 'number' | 'text' | 'date';
  autoShift?: boolean;
  targetBoardId?: number;
  allowMultiple?: boolean;
  connectColumnId?: number;
  targetColumnId?: number;
  aggregate?: 'list' | 'sum' | 'avg' | 'min' | 'max' | 'count' | 'earliest' | 'latest';
}

export type CellValue =
  | { text: string }
  | { number: number }
  | { labelId: string }
  | { optionIds: string[] }
  | { userIds: number[] }
  | { date: string; time?: string }
  | { from: string; to: string }
  | { checked: boolean }
  | { url: string; label?: string }
  | { rating: number }
  | { formula: number | string | boolean | null; error?: string }
  | { itemIds: number[] }
  | { mirror: number | string | null; error?: string }
  | { totalSeconds: number; runningSince: string | null; runningUserId: number | null }
  | { fileIds: number[] }
  | AiCellValue;

export interface AiCellValue {
  text: string;
  labelId?: string;
  state: 'pending' | 'done' | 'error';
  error?: string;
  at: string;
}

export const DEFAULT_STATUS_LABELS: Label[] = [
  { id: 'todo', name: 'To do', color: '#9CA3AF' },
  { id: 'progress', name: 'In progress', color: '#F5A524' },
  { id: 'blocked', name: 'Blocked', color: '#E5484D' },
  { id: 'done', name: 'Done', color: '#2BB673' },
];

export const COLUMN_TYPE_META: Record<ColumnType, { label: string; icon: string }> = {
  text: { label: 'Text', icon: 'Type' },
  long_text: { label: 'Long text', icon: 'AlignLeft' },
  number: { label: 'Numbers', icon: 'Hash' },
  status: { label: 'Status', icon: 'CircleDot' },
  dropdown: { label: 'Dropdown', icon: 'ListChecks' },
  people: { label: 'People', icon: 'Users' },
  date: { label: 'Date', icon: 'Calendar' },
  timeline: { label: 'Timeline', icon: 'GanttChart' },
  checkbox: { label: 'Checkbox', icon: 'CheckSquare' },
  link: { label: 'Link', icon: 'Link' },
  email: { label: 'Email', icon: 'Mail' },
  phone: { label: 'Phone', icon: 'Phone' },
  rating: { label: 'Rating', icon: 'Star' },
  ai: { label: 'AI column', icon: 'Sparkles' },
  formula: { label: 'Formula', icon: 'Sigma' },
  dependency: { label: 'Dependency', icon: 'GitBranch' },
  connect: { label: 'Connect boards', icon: 'Link2' },
  mirror: { label: 'Mirror', icon: 'Copy' },
  time_tracking: { label: 'Time tracking', icon: 'Timer' },
  file: { label: 'Files', icon: 'Paperclip' },
};

export function doneLabelIdsFor(column: { settings: ColumnSettings }): string[] {
  const labels = column.settings.labels ?? [];
  const configured = column.settings.doneLabelIds ?? [];
  const ids = configured.length
    ? configured
    : labels
        .filter((label) => /^(done|complete|completed)$/i.test(label.name))
        .map((label) => label.id);
  return labels.filter((label) => ids.includes(label.id)).map((label) => label.id);
}

export function doneLabelFor(column: { settings: ColumnSettings }): string | null {
  return doneLabelIdsFor(column)[0] ?? null;
}

export function isDoneValue(
  column: { type: ColumnType; settings: ColumnSettings },
  value: CellValue | undefined,
): boolean {
  if (column.type !== 'status') return false;
  const labelId = (value as { labelId?: string } | undefined)?.labelId;
  if (!labelId) return false;
  const labels = column.settings.labels ?? [];
  const configured = column.settings.doneLabelIds;
  if (configured && configured.length) return configured.includes(labelId);
  if (labelId === 'done') return true;
  const label = labels.find((entry) => entry.id === labelId);
  return Boolean(label && /^(done|complete|completed)$/i.test(label.name));
}

export const COMPUTED_TYPES: ColumnType[] = ['formula', 'mirror'];
export const SERVER_MANAGED_TYPES: ColumnType[] = ['ai', 'formula', 'mirror', 'time_tracking'];

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m`;
}

export function newLabelId(): string {
  return globalThis.crypto.randomUUID().slice(0, 8);
}

export function defaultSettings(type: ColumnType): ColumnSettings {
  switch (type) {
    case 'status':
      return { labels: DEFAULT_STATUS_LABELS.map((l) => ({ ...l })) };
    case 'dropdown':
      return { options: [] };
    case 'number':
      return { unitPosition: 'suffix', decimals: 0 };
    case 'rating':
      return { max: 5 };
    case 'date':
      return { includeTime: false };
    case 'ai':
      return { prompt: '', autoRun: true, output: 'text', labels: [] };
    case 'formula':
      return { expression: '', format: 'number', decimals: 0 };
    case 'dependency':
      return { autoShift: true };
    case 'connect':
      return { allowMultiple: true };
    case 'mirror':
      return { aggregate: 'list' };
    default:
      return {};
  }
}

const labelSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export function settingsSchema(_type: ColumnType): z.ZodType<ColumnSettings> {
  return z.object({
    labels: z.array(labelSchema).max(40).optional(),
    options: z.array(labelSchema).max(40).optional(),
    unit: z.string().max(20).optional(),
    unitPosition: z.enum(['prefix', 'suffix']).optional(),
    decimals: z.number().int().min(0).max(4).optional(),
    max: z.number().int().min(3).max(10).optional(),
    includeTime: z.boolean().optional(),
    prompt: z.string().max(4000).optional(),
    model: z.string().max(200).optional(),
    autoRun: z.boolean().optional(),
    output: z.enum(['text', 'label']).optional(),
    doneLabelIds: z.array(z.string().max(40)).max(40).optional(),
    expression: z.string().max(2000).optional(),
    format: z.enum(['number', 'text', 'date']).optional(),
    autoShift: z.boolean().optional(),
    targetBoardId: z.number().int().positive().optional(),
    allowMultiple: z.boolean().optional(),
    connectColumnId: z.number().int().positive().optional(),
    targetColumnId: z.number().int().positive().optional(),
    aggregate: z
      .enum(['list', 'sum', 'avg', 'min', 'max', 'count', 'earliest', 'latest'])
      .optional(),
  }) as z.ZodType<ColumnSettings>;
}

const aiCellSchema = z.object({
  text: z.string(),
  labelId: z.string().optional(),
  state: z.enum(['pending', 'done', 'error']),
  error: z.string().optional(),
  at: z.string(),
});

function fail(message: string): never {
  throw new Error(message);
}

export function validateValue(type: ColumnType, settings: ColumnSettings, raw: unknown): CellValue {
  switch (type) {
    case 'text':
    case 'long_text':
    case 'email':
    case 'phone': {
      const text = typeof raw === 'string' ? raw : (raw as { text?: unknown } | null)?.text;
      if (typeof text !== 'string') fail('Expected text');
      const max = type === 'long_text' ? 20000 : 2000;
      if (text.length > max) fail(`Text must be at most ${max} characters`);
      if (type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text)) fail('Invalid email');
      return { text };
    }
    case 'number': {
      const number = typeof raw === 'number' ? raw : (raw as { number?: unknown } | null)?.number;
      if (typeof number !== 'number' || !Number.isFinite(number)) fail('Expected a number');
      return { number };
    }
    case 'status': {
      const labelId = typeof raw === 'string' ? raw : (raw as { labelId?: unknown })?.labelId;
      const labels = settings.labels ?? [];
      if (typeof labelId !== 'string' || !labels.some((l) => l.id === labelId))
        fail('Unknown status label');
      return { labelId: labelId as string };
    }
    case 'dropdown': {
      const ids = Array.isArray(raw)
        ? raw
        : (((raw as { optionIds?: unknown })?.optionIds as unknown) ?? []);
      const options = settings.options ?? [];
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string'))
        fail('Expected option ids');
      for (const id of ids) {
        if (!options.some((o) => o.id === id)) fail('Unknown dropdown option');
      }
      return { optionIds: ids as string[] };
    }
    case 'people': {
      const ids = Array.isArray(raw)
        ? raw
        : (((raw as { userIds?: unknown })?.userIds as unknown) ?? []);
      if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id)))
        fail('Expected user ids');
      return { userIds: ids as number[] };
    }
    case 'date': {
      const obj = (raw ?? {}) as { date?: unknown; time?: unknown };
      if (typeof obj.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.date))
        fail('Invalid date');
      if (
        obj.time !== undefined &&
        (typeof obj.time !== 'string' || !/^\d{2}:\d{2}$/.test(obj.time))
      )
        fail('Invalid time');
      return obj.time ? { date: obj.date, time: obj.time as string } : { date: obj.date };
    }
    case 'timeline': {
      const obj = (raw ?? {}) as { from?: unknown; to?: unknown };
      if (typeof obj.from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.from))
        fail('Invalid start date');
      if (typeof obj.to !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.to))
        fail('Invalid end date');
      if (obj.from > obj.to) fail('Start date must be before end date');
      return { from: obj.from, to: obj.to };
    }
    case 'checkbox': {
      const checked = typeof raw === 'boolean' ? raw : (raw as { checked?: unknown })?.checked;
      if (typeof checked !== 'boolean') fail('Expected a boolean');
      return { checked: checked as boolean };
    }
    case 'link': {
      const obj = (raw ?? {}) as { url?: unknown; label?: unknown };
      if (typeof obj.url !== 'string' || !/^https?:\/\//.test(obj.url)) fail('Invalid URL');
      return obj.label
        ? { url: obj.url, label: String(obj.label).slice(0, 200) }
        : { url: obj.url };
    }
    case 'rating': {
      const rating = typeof raw === 'number' ? raw : (raw as { rating?: unknown })?.rating;
      const max = settings.max ?? 5;
      if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > max)
        fail(`Rating must be between 1 and ${max}`);
      return { rating: rating as number };
    }
    case 'ai':
      return aiCellSchema.parse(raw) as AiCellValue;
    case 'file': {
      const ids = (raw as { fileIds?: unknown } | null)?.fileIds ?? raw;
      if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id)))
        fail('Expected file ids');
      return { fileIds: ids as number[] };
    }
    case 'formula':
    case 'mirror':
      return raw as CellValue;
    case 'dependency':
    case 'connect': {
      const ids = (raw as { itemIds?: unknown } | null)?.itemIds ?? raw;
      if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id)))
        fail('Expected item ids');
      return { itemIds: ids as number[] };
    }
    case 'time_tracking': {
      const value = raw as {
        totalSeconds?: unknown;
        runningSince?: unknown;
        runningUserId?: unknown;
      };
      if (typeof value?.totalSeconds !== 'number' || !Number.isFinite(value.totalSeconds))
        fail('Expected totalSeconds');
      return {
        totalSeconds: value.totalSeconds,
        runningSince: (value.runningSince as string | null) ?? null,
        runningUserId: (value.runningUserId as number | null) ?? null,
      };
    }
  }
}

export function isEmptyValue(type: ColumnType, value: CellValue | undefined): boolean {
  if (!value) return true;
  switch (type) {
    case 'text':
    case 'long_text':
    case 'email':
    case 'phone':
      return !(value as { text?: string }).text?.trim();
    case 'number':
      return typeof (value as { number?: number }).number !== 'number';
    case 'status':
      return !(value as { labelId?: string }).labelId;
    case 'dropdown':
      return ((value as { optionIds?: string[] }).optionIds ?? []).length === 0;
    case 'people':
      return ((value as { userIds?: number[] }).userIds ?? []).length === 0;
    case 'date':
      return !(value as { date?: string }).date;
    case 'timeline':
      return !(value as { from?: string }).from || !(value as { to?: string }).to;
    case 'checkbox':
      return !(value as { checked?: boolean }).checked;
    case 'link':
      return !(value as { url?: string }).url;
    case 'rating':
      return !(value as { rating?: number }).rating;
    case 'ai': {
      const ai = value as AiCellValue;
      return !ai.text && !ai.labelId;
    }
    case 'file':
      return ((value as { fileIds?: number[] }).fileIds ?? []).length === 0;
    case 'formula':
      return (
        (value as { formula?: unknown }).formula === null ||
        (value as { formula?: unknown }).formula === undefined ||
        (value as { formula?: unknown }).formula === ''
      );
    case 'mirror':
      return (
        (value as { mirror?: unknown }).mirror === null ||
        (value as { mirror?: unknown }).mirror === undefined ||
        (value as { mirror?: unknown }).mirror === ''
      );
    case 'dependency':
    case 'connect':
      return ((value as { itemIds?: number[] }).itemIds ?? []).length === 0;
    case 'time_tracking': {
      const v = value as { totalSeconds?: number; runningSince?: string | null };
      return !v.totalSeconds && !v.runningSince;
    }
  }
}

function formatNumber(settings: ColumnSettings, n: number): string {
  const decimals = settings.decimals ?? 0;
  const text = n.toFixed(decimals);
  const unit = settings.unit ?? '';
  if (!unit) return text;
  return settings.unitPosition === 'prefix' ? `${unit}${text}` : `${text}${unit}`;
}

export function cellToText(
  type: ColumnType,
  settings: ColumnSettings,
  value: CellValue | undefined,
  userName: (id: number) => string,
  _itemName?: (id: number) => string,
): string {
  if (!value || isEmptyValue(type, value)) return '';
  switch (type) {
    case 'text':
    case 'long_text':
    case 'email':
    case 'phone':
      return (value as { text: string }).text;
    case 'number':
      return formatNumber(settings, (value as { number: number }).number);
    case 'status': {
      const id = (value as { labelId: string }).labelId;
      return settings.labels?.find((l) => l.id === id)?.name ?? '';
    }
    case 'dropdown': {
      const ids = (value as { optionIds: string[] }).optionIds;
      return ids
        .map((id) => settings.options?.find((o) => o.id === id)?.name)
        .filter(Boolean)
        .join(', ');
    }
    case 'people':
      return (value as { userIds: number[] }).userIds.map(userName).join(', ');
    case 'date': {
      const v = value as { date: string; time?: string };
      return v.time ? `${v.date} ${v.time}` : v.date;
    }
    case 'timeline': {
      const v = value as { from: string; to: string };
      return `${v.from} → ${v.to}`;
    }
    case 'checkbox':
      return (value as { checked: boolean }).checked ? 'yes' : 'no';
    case 'link':
      return (value as { url: string }).url;
    case 'rating': {
      const v = value as { rating: number };
      return `${v.rating}/${settings.max ?? 5}`;
    }
    case 'ai': {
      const v = value as AiCellValue;
      if (v.labelId) {
        const name = settings.labels?.find((l) => l.id === v.labelId)?.name;
        if (name) return name;
      }
      return v.text;
    }
    case 'file': {
      const count = ((value as { fileIds?: number[] }).fileIds ?? []).length;
      return count ? `${count} file${count === 1 ? '' : 's'}` : '';
    }
    case 'formula': {
      const v = value as { formula?: number | string | boolean | null; error?: string };
      if (v.error) return '#ERROR';
      if (v.formula === null || v.formula === undefined) return '';
      if (typeof v.formula === 'boolean') return v.formula ? 'yes' : 'no';
      if (typeof v.formula === 'number') return formatNumber(settings, v.formula);
      return String(v.formula);
    }
    case 'mirror': {
      const v = value as { mirror?: number | string | null; error?: string };
      if (v.error) return '#ERROR';
      return v.mirror === null || v.mirror === undefined ? '' : String(v.mirror);
    }
    case 'dependency':
    case 'connect':
      return ((value as { itemIds?: number[] }).itemIds ?? [])
        .map((id) => _itemName?.(id) ?? `#${id}`)
        .join(', ');
    case 'time_tracking':
      return formatDuration((value as { totalSeconds: number }).totalSeconds);
  }
}
