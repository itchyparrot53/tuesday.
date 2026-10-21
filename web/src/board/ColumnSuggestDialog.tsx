import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnSettings, ColumnType } from '../../../shared/columns';
import { api } from '../lib/api';
import { COLUMN_ICONS } from './columnIcons';
import { useCreateColumn } from './mutations';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Spinner } from '../components/ui/Spinner';

interface Suggestion {
  title: string;
  type: ColumnType;
  settings: Record<string, unknown>;
  reason: string;
}

export function ColumnSuggestDialog({
  open,
  onOpenChange,
  boardId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: number;
}) {
  const create = useCreateColumn(boardId);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
  const suggestions = useQuery({
    queryKey: ['column-suggestions', boardId],
    queryFn: () =>
      api<{ suggestions: Suggestion[] }>('POST', `/boards/${boardId}/ai-column-suggestions`).then(
        (data) => data.suggestions,
      ),
    enabled: open,
  });

  async function add() {
    const rows = (suggestions.data ?? []).filter((_, index) => selected.has(index));
    setAdding(true);
    try {
      for (const row of rows) {
        await create.mutateAsync({
          title: row.title,
          type: row.type,
          settings: row.settings as unknown as Record<string, unknown>,
        });
      }
      onOpenChange(false);
      setSelected(new Set());
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Suggest columns"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={adding} disabled={selected.size === 0} onClick={() => void add()}>
            Add {selected.size} columns
          </Button>
        </>
      }
    >
      <div data-testid="column-suggestion" className="space-y-1">
        {suggestions.isLoading && <Spinner size={16} />}
        {(suggestions.data ?? []).map((suggestion, index) => {
          const Icon = COLUMN_ICONS[suggestion.type] ?? COLUMN_ICONS.text;
          return (
            <label
              key={`${suggestion.title}-${index}`}
              className="flex cursor-pointer items-start gap-2 rounded-control border border-line p-2 hover:bg-surface-2"
            >
              <input
                type="checkbox"
                checked={selected.has(index)}
                onChange={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(index)) next.delete(index);
                    else next.add(index);
                    return next;
                  })
                }
                className="mt-0.5"
              />
              <Icon size={14} className="mt-0.5 text-muted" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{suggestion.title}</span>
                <span className="block t-meta text-muted">{suggestion.reason}</span>
              </span>
            </label>
          );
        })}
        {!suggestions.isLoading && (suggestions.data?.length ?? 0) === 0 && (
          <p className="t-meta text-muted">No suggestions right now.</p>
        )}
      </div>
    </Dialog>
  );
}
