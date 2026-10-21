import { useState } from 'react';
import type { CellEditorProps } from './CellEditor';
import { useSetValue } from '../mutations';

export function NumberCell({ column, item, boardId }: CellEditorProps) {
  const value = item.values[String(column.id)] as { number?: number } | undefined;
  const setValue = useSetValue(boardId);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  if (editing) {
    const commit = () => {
      setEditing(false);
      const trimmed = draft.trim();
      const next = trimmed === '' ? null : Number(trimmed);
      if (next !== null && !Number.isFinite(next)) return;
      setValue.mutate({
        itemId: item.id,
        columnId: column.id,
        value: next === null ? null : { number: next },
      });
    };
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="h-8 w-full rounded-control border border-accent bg-surface px-1 text-right text-sm outline-none"
      />
    );
  }

  return (
    <button
      className="flex h-full w-full items-center justify-end text-right"
      onClick={() => {
        setDraft(value?.number !== undefined ? String(value.number) : '');
        setEditing(true);
      }}
    >
      {value?.number !== undefined ? (
        <span className="text-sm text-ink">
          {(() => {
            const text = value.number.toFixed(column.settings.decimals ?? 0);
            const unit = column.settings.unit ?? '';
            return column.settings.unitPosition === 'prefix' ? `${unit}${text}` : `${text}${unit}`;
          })()}
        </span>
      ) : (
        <span className="text-sm text-transparent">·</span>
      )}
    </button>
  );
}
