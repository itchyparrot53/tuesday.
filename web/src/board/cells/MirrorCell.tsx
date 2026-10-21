import type { CellEditorProps } from './CellEditor';

export function MirrorCell({ column, item }: CellEditorProps) {
  const value = item.values[String(column.id)] as
    { mirror?: number | string | null; error?: string } | undefined;
  if (value?.error) {
    return (
      <span className="truncate text-sm text-danger" title={value.error}>
        {value.error}
      </span>
    );
  }
  if (value?.mirror === null || value?.mirror === undefined) return null;
  return <span className="truncate text-sm">{String(value.mirror)}</span>;
}
