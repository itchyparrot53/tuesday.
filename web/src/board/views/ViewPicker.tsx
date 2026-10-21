import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CalendarDays, ChartGantt, Columns3, Plus, Table2 } from 'lucide-react';
import { Menu, MenuItem } from '../../components/ui/Menu';
import { Dialog } from '../../components/ui/Dialog';
import { Button } from '../../components/ui/Button';
import { Textarea } from '../../components/ui/Input';
import { Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { useAiStatus } from '../../hooks/useAiStatus';
import type { ViewSettings } from '../../../../shared/types';
import { useCreateView } from '../mutations';
import type { BoardFull, ViewType } from '../../../../shared/types';

const TYPES: { type: ViewType; label: string; icon: typeof Table2 }[] = [
  { type: 'table', label: 'Table', icon: Table2 },
  { type: 'kanban', label: 'Kanban', icon: Columns3 },
  { type: 'calendar', label: 'Calendar', icon: CalendarDays },
  { type: 'timeline', label: 'Timeline', icon: ChartGantt },
];

export function ViewPicker({ full }: { full: BoardFull }) {
  const create = useCreateView(full.board.id);
  const navigate = useNavigate();
  const ai = useAiStatus();
  const [describeOpen, setDescribeOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<{
    name: string;
    type: 'table' | 'kanban' | 'calendar' | 'timeline';
    settings: ViewSettings;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <Menu
        trigger={
          <button
            data-testid="view-picker"
            aria-label="Add view"
            title="Add view"
            className="mb-1 rounded-control p-1 text-muted hover:bg-sunken hover:text-ink"
          >
            <Plus size={14} />
          </button>
        }
      >
        {TYPES.map(({ type, label, icon: Icon }) => (
          <MenuItem
            key={type}
            onSelect={async () => {
              const created = await create.mutateAsync({ name: label, type });
              navigate(`?view=${created.view.id}`);
            }}
          >
            <Icon size={14} className="text-muted" />
            {label}
          </MenuItem>
        ))}
        {ai.data?.usable && (
          <>
            <MenuItem data-testid="describe-view" onSelect={() => setDescribeOpen(true)}>
              <Sparkles size={14} className="text-ai" />
              Describe a view…
            </MenuItem>
          </>
        )}
      </Menu>
      <Dialog
        open={describeOpen}
        onOpenChange={(open) => {
          setDescribeOpen(open);
          if (!open) setDraft(null);
        }}
        title="Describe a view"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDescribeOpen(false)}>
              Discard
            </Button>
            <Button
              disabled={!draft}
              onClick={async () => {
                if (!draft) return;
                const created = await create.mutateAsync({
                  name: draft.name,
                  type: draft.type,
                  settings: draft.settings as unknown as Record<string, unknown>,
                });
                setDescribeOpen(false);
                navigate(`?view=${created.view.id}`);
              }}
            >
              Save view
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Textarea
            aria-label="Describe the view"
            rows={3}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="e.g. a kanban of status, only my items"
          />
          <Button
            size="sm"
            loading={loading}
            disabled={!prompt.trim()}
            onClick={async () => {
              setLoading(true);
              setError('');
              try {
                const result = await api<{ draft: typeof draft }>(
                  'POST',
                  `/boards/${full.board.id}/ai-view`,
                  { prompt },
                );
                setDraft(result.draft);
              } catch (caught) {
                setError(caught instanceof Error ? caught.message : 'Something went wrong');
              } finally {
                setLoading(false);
              }
            }}
          >
            Generate
          </Button>
          {draft && (
            <div
              data-testid="view-preview-banner"
              className="rounded-control border border-ai bg-ai-soft p-3"
            >
              <p className="text-sm font-semibold text-ink">
                Previewing “{draft.name}” — {draft.type}
              </p>
              <p className="t-meta text-muted">Save view to keep it, or Discard.</p>
            </div>
          )}
          {error && <p className="text-sm text-danger-text">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
