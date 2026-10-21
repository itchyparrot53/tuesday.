import type { CellEditorProps } from './CellEditor';
import { Check } from 'lucide-react';
import { useSetValue } from '../mutations';

export function CheckboxCell({ column, item, boardId }: CellEditorProps) {
  const value = item.values[String(column.id)] as { checked?: boolean } | undefined;
  const setValue = useSetValue(boardId);
  return (
    <button
      aria-label={value?.checked ? 'Uncheck' : 'Check'}
      className="flex h-9 w-full items-center justify-center"
      onClick={() =>
        setValue.mutate({
          itemId: item.id,
          columnId: column.id,
          value: value?.checked ? null : { checked: true },
        })
      }
    >
      {value?.checked && <Check size={16} className="text-success" />}
    </button>
  );
}
