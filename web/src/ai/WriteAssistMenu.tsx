import { useRef, useState } from 'react';
import { Sparkles, Undo2 } from 'lucide-react';
import { api } from '../lib/api';
import { Menu, MenuItem } from '../components/ui/Menu';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import type { WriteMode } from '../../../shared/ai';

const MODES: { mode: WriteMode; label: string }[] = [
  { mode: 'improve', label: 'Improve' },
  { mode: 'shorten', label: 'Shorten' },
  { mode: 'fix', label: 'Fix spelling' },
  { mode: 'formal', label: 'Make formal' },
  { mode: 'friendly', label: 'Make friendly' },
];

export function WriteAssistMenu({
  text,
  onReplace,
  disabled,
}: {
  text: string;
  onReplace: (text: string) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const toast = useToast();

  async function apply(mode: WriteMode) {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const data = await api<{ text: string }>('POST', '/ai/write', { text, mode });
      const original = text;
      onReplace(data.text);
      setUndo(original);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setUndo(null), 10_000);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      {busy && <Spinner size={13} className="text-ai" />}
      <Menu
        align="start"
        trigger={
          <button
            type="button"
            aria-label="Writing help"
            title="Writing help"
            disabled={disabled || busy || !text.trim()}
            className="inline-flex h-7 items-center gap-1 rounded-control bg-ai-soft px-2 text-sm font-semibold text-ai hover:bg-ai-soft/80 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Sparkles size={14} /> AI
          </button>
        }
      >
        {MODES.map((entry) => (
          <MenuItem key={entry.mode} onSelect={() => apply(entry.mode)}>
            {entry.label}
          </MenuItem>
        ))}
      </Menu>
      {undo !== null && (
        <button
          type="button"
          className="flex items-center gap-1 t-meta text-muted hover:text-ink"
          onClick={() => {
            onReplace(undo);
            setUndo(null);
          }}
        >
          <Undo2 size={11} /> Undo
        </button>
      )}
    </div>
  );
}
