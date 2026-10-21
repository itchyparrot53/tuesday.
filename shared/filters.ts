import { cellToText, isEmptyValue, type CellValue } from './columns';
import type { Column, Filter, FilterOp, Item, ViewSettings } from './types';

export interface FilterContext {
  userName: (id: number) => string;
  itemName?: (id: number) => string;
}

export function matchFilter(
  item: Item,
  column: Column,
  filter: { op: FilterOp; value: string | number | null },
  ctx: FilterContext,
): boolean {
  const value = item.values[String(column.id)] as CellValue | undefined;
  const text = cellToText(column.type, column.settings, value, ctx.userName, ctx.itemName);
  const empty = isEmptyValue(column.type, value);

  if (filter.op === 'is_empty') return empty;
  if (filter.op === 'is_not_empty') return !empty;

  if (column.type === 'status') {
    const labelId = (value as { labelId?: string } | undefined)?.labelId ?? '';
    if (filter.op === 'is') return labelId === filter.value;
    if (filter.op === 'is_not') return labelId !== filter.value;
  }
  if (column.type === 'dropdown') {
    const ids = (value as { optionIds?: string[] } | undefined)?.optionIds ?? [];
    if (filter.op === 'is' || filter.op === 'is_not') {
      const has = ids.includes(String(filter.value));
      return filter.op === 'is' ? has : !has;
    }
  }
  if (column.type === 'people') {
    const ids = (value as { userIds?: number[] } | undefined)?.userIds ?? [];
    const has = ids.includes(Number(filter.value));
    if (filter.op === 'is') return has;
    if (filter.op === 'is_not') return !has;
  }
  if (column.type === 'checkbox') {
    const checked = Boolean((value as { checked?: boolean } | undefined)?.checked);
    const wanted = filter.value === 'yes' || filter.value === 'true';
    if (filter.op === 'is') return checked === wanted;
    if (filter.op === 'is_not') return checked !== wanted;
  }

  if (filter.op === 'contains')
    return text.toLowerCase().includes(String(filter.value).toLowerCase());
  if (filter.op === 'gt' || filter.op === 'lt') {
    if (column.type === 'date' || column.type === 'timeline') {
      const stored =
        column.type === 'date'
          ? (value as { date?: string } | undefined)?.date
          : (value as { from?: string } | undefined)?.from;
      if (!stored) return false;
      return filter.op === 'gt' ? stored > String(filter.value) : stored < String(filter.value);
    }
    if (column.type === 'time_tracking') {
      const seconds = (value as { totalSeconds?: number } | undefined)?.totalSeconds ?? 0;
      const hours = seconds / 3600;
      const target = Number(filter.value);
      return filter.op === 'gt' ? hours > target : hours < target;
    }
    const numeric = Number(text);
    if (
      (column.type === 'number' ||
        column.type === 'rating' ||
        column.type === 'formula' ||
        column.type === 'mirror') &&
      Number.isFinite(numeric)
    ) {
      const target = Number(filter.value);
      return filter.op === 'gt' ? numeric > target : numeric < target;
    }
    const left = text;
    const right = String(filter.value);
    return filter.op === 'gt' ? left > right : left < right;
  }
  if (filter.op === 'is') return text === String(filter.value);
  if (filter.op === 'is_not') return text !== String(filter.value);
  return true;
}

export function applyView(
  items: Item[],
  columns: Column[],
  settings: ViewSettings,
  ctx: FilterContext,
): Item[] {
  const columnById = new Map(columns.map((column) => [column.id, column]));
  const search = settings.search.trim().toLowerCase();

  const matches = (item: Item): boolean => {
    if (search) {
      const inName = item.name.toLowerCase().includes(search);
      const inValues = columns.some((column) =>
        cellToText(
          column.type,
          column.settings,
          item.values[String(column.id)] as CellValue | undefined,
          ctx.userName,
          ctx.itemName,
        )
          .toLowerCase()
          .includes(search),
      );
      if (!inName && !inValues) return false;
    }
    if (settings.personUserId !== null) {
      const found = columns.some((column) => {
        if (column.type !== 'people') return false;
        const ids =
          (item.values[String(column.id)] as { userIds?: number[] } | undefined)?.userIds ?? [];
        return ids.includes(settings.personUserId!);
      });
      if (!found) return false;
    }
    for (const filter of settings.filters) {
      const column = columnById.get(filter.columnId);
      if (!column) continue;
      if (!matchFilter(item, column, filter, ctx)) return false;
    }
    return true;
  };

  const visible = new Set<number>();
  for (const item of items) {
    if (matches(item)) visible.add(item.id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parentId !== null && visible.has(item.id) && !visible.has(item.parentId)) {
        visible.add(item.parentId);
        changed = true;
      }
      if (item.parentId !== null && visible.has(item.parentId) && !visible.has(item.id)) {
        visible.add(item.id);
        changed = true;
      }
    }
  }

  let result = items.filter((item) => visible.has(item.id));

  if (settings.sort) {
    const { columnId, dir } = settings.sort;
    const factor = dir === 'asc' ? 1 : -1;
    const column = typeof columnId === 'number' ? columnById.get(columnId) : undefined;
    result = [...result].sort((a, b) => {
      if (!column) return a.name.localeCompare(b.name) * factor;
      if (column.type === 'number' || column.type === 'rating') {
        const av = Number(
          cellToText(
            column.type,
            column.settings,
            a.values[String(column.id)] as CellValue | undefined,
            ctx.userName,
            ctx.itemName,
          ) || 0,
        );
        const bv = Number(
          cellToText(
            column.type,
            column.settings,
            b.values[String(column.id)] as CellValue | undefined,
            ctx.userName,
            ctx.itemName,
          ) || 0,
        );
        return (av - bv) * factor;
      }
      const at = cellToText(
        column.type,
        column.settings,
        a.values[String(column.id)] as CellValue | undefined,
        ctx.userName,
        ctx.itemName,
      );
      const bt = cellToText(
        column.type,
        column.settings,
        b.values[String(column.id)] as CellValue | undefined,
        ctx.userName,
        ctx.itemName,
      );
      return at.localeCompare(bt) * factor;
    });
  }

  return result;
}
