import { useState } from 'react';
import { FileText, LayoutDashboard, ListTodo } from 'lucide-react';
import type { AiContext } from '../../../../shared/ai';
import type { SearchResult } from '../../../../shared/types';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Input';

const MAX = 5;

export function ContextPicker({
  open,
  onOpenChange,
  context,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: AiContext;
  onSave: (context: AiContext) => Promise<void> | void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult | null>(null);
  const [next, setNext] = useState<AiContext>(context);

  function toggle(kind: keyof AiContext, id: number) {
    setNext((current) => {
      const values = current[kind];
      if (values.includes(id))
        return { ...current, [kind]: values.filter((value) => value !== id) };
      if (values.length >= MAX) return current;
      return { ...current, [kind]: [...values, id] };
    });
  }

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults(null);
      return;
    }
    setResults(await api<SearchResult>('GET', `/search?q=${encodeURIComponent(value.trim())}`));
  }

  const row = (kind: keyof AiContext, id: number, name: string) => {
    const checked = next[kind].includes(id);
    return (
      <label
        key={`${kind}-${id}`}
        className="flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 hover:bg-sunken"
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggle(kind, id)}
          className="accent-[var(--accent)]"
        />
        <span className="truncate text-sm text-ink">{name}</span>
        <span className="ml-auto t-meta text-muted">
          {next[kind].length >= MAX && !checked ? 'Max 5' : ''}
        </span>
      </label>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) setNext(context);
        onOpenChange(value);
      }}
      title="Add context"
    >
      <div className="space-y-3">
        <Input
          autoFocus
          value={query}
          onChange={(event) => void search(event.target.value)}
          placeholder="Search boards, items and docs…"
          aria-label="Search context"
        />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {results?.boards.map((board) => (
            <div key={`board-${board.id}`} className="flex items-center gap-1">
              <LayoutDashboard size={12} className="text-muted" />
              {row('boardIds', board.id, board.name)}
            </div>
          ))}
          {results?.items.map((item) => (
            <div key={`item-${item.id}`} className="flex items-center gap-1">
              <ListTodo size={12} className="text-muted" />
              {row('itemIds', item.id, `${item.name} · ${item.boardName}`)}
            </div>
          ))}
          {results?.docs.map((doc) => (
            <div key={`doc-${doc.id}`} className="flex items-center gap-1">
              <FileText size={12} className="text-muted" />
              {row('docIds', doc.id, doc.title)}
            </div>
          ))}
          {!results && <p className="px-2 py-2 t-meta text-muted">Type at least two characters.</p>}
        </div>
        <p className="t-meta text-muted">
          {next.boardIds.length} boards · {next.itemIds.length} items · {next.docIds.length} docs
          (max 5 each)
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={async () => {
              await onSave(next);
              onOpenChange(false);
            }}
          >
            Add context
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
