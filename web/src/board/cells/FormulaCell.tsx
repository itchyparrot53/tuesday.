import { shortDate } from '../../lib/format';
import type { CellEditorProps } from './CellEditor';

export function FormulaCell({ column, item }: CellEditorProps) {
  const value = item.values[String(column.id)] as
    { formula?: number | string | boolean | null; error?: string } | undefined;
  if (value?.error) {
    return (
      <span className="truncate text-sm font-medium text-danger" title={value.error}>
        {value.error}
      </span>
    );
  }
  if (value?.formula === null || value?.formula === undefined) return null;
  if (typeof value.formula === 'boolean') {
    return <span className="text-sm">{value.formula ? '✓' : '–'}</span>;
  }
  if (typeof value.formula === 'number') {
    return (
      <span className="w-full truncate text-right text-sm">
        {value.formula.toFixed(column.settings.decimals ?? 0)}
      </span>
    );
  }
  if (column.settings.format === 'date') {
    return <span className="truncate text-sm">{shortDate(String(value.formula))}</span>;
  }
  return <span className="truncate text-sm">{String(value.formula)}</span>;
}
