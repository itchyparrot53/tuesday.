import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Link2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Popover } from '../../components/ui/Popover';
import { useSetValue } from '../mutations';
import type { CellEditorProps } from './CellEditor';
import type { Item } from '../../../../shared/types';

export function ConnectCell({ column, item, boardId }: CellEditorProps) {
  const setValue = useSetValue(boardId);
  const navigate = useNavigate();
  const targetBoardId = column.settings.targetBoardId;
  const items = useQuery({
    queryKey: ['items', targetBoardId],
    queryFn: async () =>
      (await api<{ items: Item[] }>('GET', `/boards/${targetBoardId}/items`)).items,
    enabled: Boolean(targetBoardId),
  });
  const value = item.values[String(column.id)] as { itemIds?: number[] } | undefined;
  const ids = value?.itemIds ?? [];
  const options = items.data ?? [];
  const byId = new Map(options.map((entry) => [entry.id, entry.name]));
  const multiple = column.settings.allowMultiple !== false;

  return (
    <Popover
      className="w-[260px]"
      trigger={
        <button className="flex h-full w-full items-center gap-1 overflow-hidden text-left text-sm">
          {ids.length ? (
            <span className="truncate text-ink">
              {ids.map((id) => byId.get(id) ?? `#${id}`).join(', ')}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-muted">
              <Link2 size={11} /> Connect…
            </span>
          )}
        </button>
      }
    >
      <div className="max-h-[260px] space-y-0.5 overflow-auto">
        {options
          .filter((entry) => entry.parentId === null)
          .map((entry) => {
            const checked = ids.includes(entry.id);
            return (
              <label
                key={entry.id}
                className="flex items-center gap-2 rounded-control px-1 py-1 text-sm hover:bg-sunken"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setValue.mutate({
                      itemId: item.id,
                      columnId: column.id,
                      value: {
                        itemIds: checked
                          ? ids.filter((id) => id !== entry.id)
                          : multiple
                            ? [...ids, entry.id]
                            : [entry.id],
                      },
                    })
                  }
                />
                <span className="truncate">{entry.name}</span>
              </label>
            );
          })}
      </div>
      {ids.length > 0 && targetBoardId && (
        <button
          className="mt-2 t-meta text-accent"
          onClick={() => navigate(`/boards/${targetBoardId}?item=${ids[0]}`)}
        >
          Open linked item
        </button>
      )}
    </Popover>
  );
}
