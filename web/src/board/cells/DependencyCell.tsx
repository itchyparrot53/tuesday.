import { useQuery } from '@tanstack/react-query';
import { GitBranch } from 'lucide-react';
import { api } from '../../lib/api';
import { isDoneValue } from '../../../../shared/columns';
import { Popover } from '../../components/ui/Popover';
import { useSetValue } from '../mutations';
import type { CellEditorProps } from './CellEditor';
import type { Item } from '../../../../shared/types';

export function DependencyCell({ column, item, boardId }: CellEditorProps) {
  const setValue = useSetValue(boardId);
  const items = useQuery({
    queryKey: ['items', boardId],
    queryFn: async () => (await api<{ items: Item[] }>('GET', `/boards/${boardId}/items`)).items,
  });
  const value = item.values[String(column.id)] as { itemIds?: number[] } | undefined;
  const ids = value?.itemIds ?? [];
  const board = useQuery({
    queryKey: ['board', boardId],
    queryFn: () =>
      api<{ columns: { id: number; type: string; settings: Record<string, unknown> }[] }>(
        'GET',
        `/boards/${boardId}`,
      ),
  });
  const status = board.data?.columns.find((entry) => entry.type === 'status');
  const options = (items.data ?? []).filter(
    (entry) => entry.id !== item.id && entry.parentId === null,
  );
  const linked = options.filter((entry) => ids.includes(entry.id));
  const blocked = status
    ? linked.some(
        (entry) =>
          !isDoneValue(
            {
              type: 'status',
              settings: status.settings as never,
            },
            entry.values[String(status.id)],
          ),
      )
    : false;
  const byId = new Map(options.map((entry) => [entry.id, entry.name]));

  return (
    <Popover
      className="w-[260px]"
      trigger={
        <button className="flex h-full w-full items-center gap-1 overflow-hidden text-left text-sm">
          {ids.length ? (
            <>
              {blocked && <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />}
              <span className="truncate text-ink">
                Blocked by: {ids.map((id) => byId.get(id) ?? `#${id}`).join(', ')}
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1 text-muted">
              <GitBranch size={11} /> Blocked by…
            </span>
          )}
        </button>
      }
    >
      <div className="max-h-[260px] space-y-0.5 overflow-auto">
        {options.map((entry) => {
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
                      itemIds: checked ? ids.filter((id) => id !== entry.id) : [...ids, entry.id],
                    },
                  })
                }
              />
              <span className="truncate">{entry.name}</span>
            </label>
          );
        })}
      </div>
      {ids.length > 0 && (
        <button
          className="mt-2 t-meta text-muted hover:text-danger"
          onClick={() => setValue.mutate({ itemId: item.id, columnId: column.id, value: null })}
        >
          Clear dependencies
        </button>
      )}
    </Popover>
  );
}
