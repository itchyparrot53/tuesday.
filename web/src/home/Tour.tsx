import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';

const STEPS = [
  {
    anchor: 'home-summary',
    title: 'Your day starts here',
    body: "Home shows what's due, what changed and where to go next.",
  },
  {
    anchor: 'home-new',
    title: 'Create anything',
    body: 'Add an item, board, doc or dashboard from here.',
  },
  {
    anchor: 'ask-ai',
    title: 'Ask Tuesday AI',
    body: 'Chat with an assistant that knows your boards. It asks before changing anything.',
  },
  {
    anchor: 'palette-trigger',
    title: 'Jump anywhere',
    body: 'Press {shortcut} to search and run commands.',
  },
];

export function Tour({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const shortcut =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
      ? '⌘K'
      : 'Ctrl K';

  useEffect(() => {
    if (!open) return;
    const target = document.querySelector<HTMLElement>(`[data-testid="${STEPS[index].anchor}"]`);
    if (!target) {
      if (index < STEPS.length - 1) setIndex((value) => value + 1);
      else onDone();
      return;
    }
    target.scrollIntoView({ block: 'center' });
    target.classList.add('ring-2', 'ring-[var(--focus)]', 'ring-offset-2');
    setRect(target.getBoundingClientRect());
    return () => target.classList.remove('ring-2', 'ring-[var(--focus)]', 'ring-offset-2');
  }, [open, index, onDone]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onDone();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onDone]);

  if (!open) return null;
  const step = STEPS[index];
  const top = rect ? Math.min(window.innerHeight - 220, rect.bottom + 10) : 80;
  const left = rect ? Math.min(window.innerWidth - 340, Math.max(16, rect.left)) : 16;

  return (
    <div
      data-testid="tour-step"
      data-step={index + 1}
      role="dialog"
      aria-label={step.title}
      className="fixed z-[60] w-[320px] rounded-[10px] border border-line bg-surface p-3 shadow-pop"
      style={{ top, left }}
    >
      <h2 className="t-section text-ink">{step.title}</h2>
      <p className="mt-1 text-sm text-muted">{step.body.replace('{shortcut}', shortcut)}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className="t-meta text-muted">
          {index + 1} of {STEPS.length}
        </span>
        <Button size="sm" variant="ghost" data-testid="tour-skip" onClick={onDone}>
          Skip
        </Button>
        <Button
          size="sm"
          data-testid="tour-next"
          className="ml-auto"
          onClick={() => {
            if (index + 1 >= STEPS.length) onDone();
            else setIndex(index + 1);
          }}
        >
          {index + 1 >= STEPS.length ? 'Done' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
