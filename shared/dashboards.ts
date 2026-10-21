import { z } from 'zod';
import type { FilterOp } from './types';

export type WidgetType =
  'number' | 'chart' | 'battery' | 'workload' | 'items' | 'note' | 'ai_insight' | 'risk';

export interface WidgetFilter {
  columnTitle: string;
  op: FilterOp;
  value: string | number | null;
}

export interface WidgetConfig {
  boardIds?: number[];
  filters?: WidgetFilter[];
  metric?: 'count' | 'sum' | 'avg';
  valueColumnTitle?: string;
  groupBy?: 'status' | 'people' | 'group' | 'board' | 'dropdown' | 'month';
  groupByColumnTitle?: string;
  chartKind?: 'bar' | 'pie' | 'line';
  capacity?: number;
  limit?: number;
  sortColumnTitle?: string;
  text?: string;
  focus?: string;
}

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  w: 3 | 4 | 6 | 8 | 12;
  h: 1 | 2 | 3 | 4;
  config: WidgetConfig;
}

export interface Dashboard {
  id: number;
  workspaceId: number;
  name: string;
  boardIds: number[];
  widgets: Widget[];
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export type WidgetData =
  | { kind: 'number'; value: number; label: string }
  | { kind: 'series'; series: { label: string; value: number; color: string | null }[] }
  | { kind: 'battery'; total: number; segments: { label: string; color: string; count: number }[] }
  | {
      kind: 'workload';
      capacity: number | null;
      rows: { userId: number; name: string; color: string; value: number }[];
    }
  | {
      kind: 'items';
      items: {
        id: number;
        name: string;
        boardId: number;
        boardName: string;
        groupTitle: string;
        values: Record<string, string>;
      }[];
    }
  | { kind: 'note'; text: string }
  | { kind: 'ai_insight'; text: string | null; generatedAt: string | null }
  | { kind: 'risk'; report: import('./types').RiskReport };

const filterOpSchema = z.enum(['is', 'is_not', 'contains', 'is_empty', 'is_not_empty', 'gt', 'lt']);

export const widgetSchema: z.ZodType<Widget> = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(['number', 'chart', 'battery', 'workload', 'items', 'note', 'ai_insight', 'risk']),
  title: z.string().trim().min(1).max(120),
  w: z.union([z.literal(3), z.literal(4), z.literal(6), z.literal(8), z.literal(12)]),
  h: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  config: z.object({
    boardIds: z.array(z.number().int().positive()).max(20).optional(),
    filters: z
      .array(
        z.object({
          columnTitle: z.string().max(80),
          op: filterOpSchema,
          value: z.union([z.string(), z.number(), z.null()]),
        }),
      )
      .max(10)
      .optional(),
    metric: z.enum(['count', 'sum', 'avg']).optional(),
    valueColumnTitle: z.string().max(80).optional(),
    groupBy: z.enum(['status', 'people', 'group', 'board', 'dropdown', 'month']).optional(),
    groupByColumnTitle: z.string().max(80).optional(),
    chartKind: z.enum(['bar', 'pie', 'line']).optional(),
    capacity: z.number().min(0).max(100000).optional(),
    limit: z.number().int().min(1).max(50).optional(),
    sortColumnTitle: z.string().max(80).optional(),
    text: z.string().max(4000).optional(),
    focus: z.string().max(500).optional(),
  }),
}) as z.ZodType<Widget>;

export const dashboardInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  boardIds: z.array(z.number().int().positive()).min(1).max(20),
  widgets: z.array(widgetSchema).max(30).optional(),
});
