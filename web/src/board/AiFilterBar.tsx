import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { ViewSettings } from '../../../shared/types';
import { api } from '../lib/api';
import { useAiStatus } from '../hooks/useAiStatus';
import { useCreateView } from './mutations';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';

type Filtered = Pick<ViewSettings, 'filters' | 'sort' | 'search' | 'personUserId'>;

export function AiFilterBar({
  boardId,
  settings,
  onChange,
  onActiveChange,
}: {
  boardId: number;
  settings: ViewSettings;
  onChange: (settings: ViewSettings) => void;
  onActiveChange?: (active: boolean) => void;
}) {
  const ai = useAiStatus();
  const createView = useCreateView(boardId);
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [explanation, setExplanation] = useState('');
  const [previous, setPrevious] = useState<ViewSettings | null>(null);
  const [loading, setLoading] = useState(false);

  if (!ai.data?.usable) return null;

  async function apply() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const result = await api<{ settings: Filtered; explanation: string }>(
        'POST',
        `/boards/${boardId}/ai-filter`,
        { text },
      );
      setPrevious(settings);
      onActiveChange?.(true);
      onChange({ ...settings, ...result.settings });
      setExplanation(result.explanation);
      setOpen(false);
      setText('');
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    if (previous) onChange(previous);
    onActiveChange?.(false);
    setExplanation('');
    setPrevious(null);
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      {open && (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            data-testid="ai-filter-input"
            aria-label="Filter with AI"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void apply();
              if (event.key === 'Escape') setOpen(false);
            }}
            placeholder="Show items that…"
            className="w-[220px]"
          />
          <Button size="sm" loading={loading} onClick={() => void apply()}>
            Apply
          </Button>
        </div>
      )}
      {!open && !explanation && (
        <Button
          data-testid="ai-filter-open"
          size="sm"
          variant="ghost"
          icon={<Sparkles size={14} className="text-ai" />}
          onClick={() => setOpen(true)}
        >
          Filter with AI
        </Button>
      )}
      {explanation && (
        <span
          data-testid="ai-filter-chip"
          className="inline-flex max-w-[280px] items-center gap-1 rounded-full bg-ai-soft px-2 py-0.5 t-meta text-ai"
        >
          <Sparkles size={11} />
          <span className="truncate">AI filter: {explanation}</span>
          <button aria-label="Clear AI filter" onClick={clear}>
            <X size={11} />
          </button>
        </span>
      )}
      {explanation && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            const name = window.prompt('Name this view', 'AI filter');
            if (name)
              createView.mutate({
                name,
                type: 'table',
                settings: settings as unknown as Record<string, unknown>,
              });
          }}
        >
          Save as view
        </Button>
      )}
    </div>
  );
}
