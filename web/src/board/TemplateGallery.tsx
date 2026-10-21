import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import type { BoardFull, TemplateInfo } from '../../../shared/types';

export function TemplateGallery({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api<{ templates: TemplateInfo[] }>('GET', '/templates')).templates,
    enabled: open,
  });
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<TemplateInfo | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const categories = ['All', ...new Set((templates.data ?? []).map((entry) => entry.category))];
  const filtered = (templates.data ?? []).filter(
    (entry) => category === 'All' || entry.category === category,
  );

  async function create() {
    if (!selected) return;
    setCreating(true);
    try {
      const full = await api<BoardFull>('POST', '/boards/from-template', {
        templateId: selected.id,
        workspaceId,
        name,
      });
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      onOpenChange(false);
      navigate(`/boards/${full.board.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSelected(null);
      }}
      title={selected ? 'Create board from template' : 'Board templates'}
      wide
      footer={
        selected ? (
          <>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              Back
            </Button>
            <Button loading={creating} disabled={!name.trim()} onClick={create}>
              Create board
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        )
      }
    >
      {selected ? (
        <div>
          <label className="mb-1 block text-sm font-medium">Board name</label>
          <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          <p className="mt-2 t-meta text-muted">
            {selected.name}: {selected.columns.join(' · ')}
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap gap-1">
            {categories.map((entry) => (
              <button
                key={entry}
                className={cn(
                  'rounded-full border px-2 py-0.5 t-meta',
                  category === entry
                    ? 'border-accent bg-accent-soft text-accent-soft-ink'
                    : 'border-line text-muted',
                )}
                onClick={() => setCategory(entry)}
              >
                {entry}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((template) => (
              <button
                key={template.id}
                data-testid="template-card"
                data-template-id={template.id}
                className="rounded-pop border border-line p-3 text-left hover:border-accent"
                onClick={() => {
                  setSelected(template);
                  setName(template.name);
                }}
              >
                <p className="t-section text-ink">{template.name}</p>
                <p className="mt-0.5 t-meta text-muted">{template.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {template.columns.map((column) => (
                    <span
                      key={column}
                      className="rounded-chip bg-surface-2 px-1.5 py-0.5 t-meta text-muted"
                    >
                      {column}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
