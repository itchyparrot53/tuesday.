import { Plus, X } from 'lucide-react';
import type { AiContext, AiConversation } from '../../../../shared/ai';
import { Button } from '../../components/ui/Button';
import { RefChip } from './RefChip';

export const SUGGESTED = ['/plan', '/summarize', '/changes', '/find'];

export function ContextPanel({
  conversation,
  onRemove,
  onAdd,
  onCommand,
  onOpenItem,
}: {
  conversation: AiConversation;
  onRemove: (context: AiContext) => void;
  onAdd: () => void;
  onCommand: (command: string) => void;
  onOpenItem: (itemId: number) => void;
}) {
  const context = conversation.context;
  const rows: { kind: 'board' | 'item' | 'doc'; id: number; key: keyof AiContext }[] = [
    ...context.boardIds.map((id) => ({ kind: 'board' as const, id, key: 'boardIds' as const })),
    ...context.itemIds.map((id) => ({ kind: 'item' as const, id, key: 'itemIds' as const })),
    ...context.docIds.map((id) => ({ kind: 'doc' as const, id, key: 'docIds' as const })),
  ];
  return (
    <aside data-testid="ai-context-panel" className="flex h-full min-h-0 flex-col bg-surface-2 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="t-label text-muted">Attached</h2>
        {rows.length > 0 && (
          <button
            className="t-meta font-semibold text-accent hover:text-accent-hover"
            onClick={() => onRemove({ boardIds: [], itemIds: [], docIds: [] })}
          >
            Clear all
          </button>
        )}
      </div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div
            key={`${row.kind}-${row.id}`}
            data-testid="ai-context-chip"
            className="flex items-center gap-1 rounded-control border border-line bg-surface px-1.5 py-1"
          >
            <RefChip kind={row.kind} id={row.id} onOpenItem={onOpenItem} />
            <button
              aria-label="Remove context"
              className="ml-auto rounded-control p-0.5 text-muted hover:bg-sunken hover:text-ink"
              onClick={() =>
                onRemove({
                  ...context,
                  [row.key]: context[row.key].filter((id) => id !== row.id),
                })
              }
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="t-meta text-muted">Nothing attached yet.</p>}
      </div>
      <Button
        size="sm"
        variant="secondary"
        className="mt-2"
        icon={<Plus size={12} />}
        onClick={onAdd}
      >
        Add context
      </Button>
      <h2 className="t-label mb-1 mt-5 text-muted">Suggested</h2>
      <div className="flex flex-wrap gap-1">
        {SUGGESTED.map((command) => (
          <button
            key={command}
            className="rounded-full border border-line bg-surface px-2 py-0.5 t-meta text-ink hover:bg-sunken"
            onClick={() => onCommand(command)}
          >
            {command}
          </button>
        ))}
      </div>
    </aside>
  );
}
