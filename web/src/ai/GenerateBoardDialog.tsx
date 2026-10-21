import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Spinner } from '../components/ui/Spinner';
import { Textarea } from '../components/ui/Input';
import { COLUMN_ICONS } from '../board/columnIcons';
import type { BoardDraft } from '../../../shared/ai';
import type { BoardFull } from '../../../shared/types';

const EXAMPLES = [
  'Hiring pipeline for 3 engineering roles',
  'Product launch plan for a mobile app',
  'Customer onboarding tracker',
];

export function GenerateBoardDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: number;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<BoardDraft | null>(null);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setGenerating(true);
    setError('');
    try {
      const data = await api<{ draft: BoardDraft }>('POST', '/ai/generate-board', {
        workspaceId,
        prompt,
      });
      setDraft(data.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setGenerating(false);
    }
  }

  async function create() {
    if (!draft) return;
    setCreating(true);
    setError('');
    try {
      const full = await api<BoardFull>('POST', '/ai/create-board', { workspaceId, draft });
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      onOpenChange(false);
      setDraft(null);
      setPrompt('');
      navigate(`/boards/${full.board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setDraft(null);
          setError('');
        }
      }}
      title="Generate board with AI"
      description={
        draft
          ? 'Review the preview, then create the board.'
          : 'Describe the board you need. The AI will design columns, groups and example items.'
      }
      wide
      footer={
        draft ? (
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Regenerate
            </Button>
            <Button loading={creating} onClick={create}>
              Create board
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              icon={<Sparkles size={14} />}
              loading={generating}
              disabled={!prompt.trim()}
              onClick={generate}
            >
              Generate
            </Button>
          </>
        )
      }
    >
      {!draft && (
        <div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            maxLength={4000}
            placeholder="e.g. Hiring pipeline for 3 engineering roles"
            autoFocus
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                className="rounded-full border border-line px-2 py-0.5 t-meta text-muted hover:bg-canvas hover:text-ink"
                onClick={() => setPrompt(example)}
              >
                {example}
              </button>
            ))}
          </div>
          {generating && (
            <p className="mt-3 flex items-center gap-2 text-xs text-muted">
              <Spinner size={13} /> Designing your board — this usually takes 10–30 seconds.
            </p>
          )}
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </div>
      )}

      {draft && (
        <div>
          <h3 className="text-lg font-semibold text-ink">{draft.name}</h3>
          <p className="mb-4 text-sm text-muted">{draft.description}</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {draft.columns.map((column) => {
              const Icon = COLUMN_ICONS[column.type];
              return (
                <span
                  key={column.title}
                  className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 t-meta text-ink"
                >
                  <Icon size={11} className="text-muted" />
                  {column.title}
                </span>
              );
            })}
          </div>
          <div className="space-y-3">
            {draft.groups.map((group) => (
              <div key={group.title} className="rounded-pop border border-line p-3">
                <p className="mb-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {group.title}
                </p>
                <ul className="space-y-0.5">
                  {draft.items
                    .filter((item) => item.group === group.title)
                    .map((item) => (
                      <li key={item.name} className="t-meta text-muted">
                        {item.name}
                      </li>
                    ))}
                  {draft.items.filter((item) => item.group === group.title).length === 0 && (
                    <li className="t-meta text-muted">No example items</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
