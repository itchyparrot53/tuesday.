import { CalendarCheck, FileText, ListTodo, NotebookPen, Search, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Logo } from '../../components/brand/Logo';

const STARTERS = [
  {
    command: '/plan',
    title: 'Plan my day',
    line: 'A prioritised list from your work.',
    icon: CalendarCheck,
  },
  {
    command: '/summarize',
    title: 'Summarize a board',
    line: 'Status, risks and next steps.',
    icon: ListTodo,
  },
  {
    command: '/changes',
    title: 'What changed this week',
    line: 'What your team moved forward.',
    icon: Search,
  },
  {
    command: '/find',
    title: 'Find items',
    line: 'Search by name, owner or status.',
    icon: Search,
  },
  {
    command: '/notes',
    title: 'Turn notes into items',
    line: 'Paste notes and create the work.',
    icon: NotebookPen,
  },
  {
    command: '/draft',
    title: 'Draft an update',
    line: 'Progress and next steps in your voice.',
    icon: FileText,
  },
] as const;

export function EmptyChat({
  usable,
  isAdmin,
  onCommand,
}: {
  usable: boolean;
  isAdmin: boolean;
  onCommand: (command: string) => void;
}) {
  if (!usable) {
    return (
      <div
        data-testid="ai-empty"
        className="mx-auto flex max-w-[360px] flex-col items-center py-16 text-center"
      >
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-muted">
          <Sparkles size={22} />
        </span>
        <h2 className="t-section text-ink">AI isn't set up yet</h2>
        <p className="mt-1 text-sm text-muted">Ask an admin to add an OpenRouter key.</p>
        {isAdmin && (
          <Button
            className="mt-4"
            size="sm"
            variant="secondary"
            onClick={() => {
              window.location.href = '/admin?tab=ai';
            }}
          >
            Open AI settings
          </Button>
        )}
      </div>
    );
  }

  return (
    <div data-testid="ai-empty" className="mx-auto max-w-[680px] py-14 max-md:py-8">
      <div className="flex flex-col items-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-control bg-ai-soft">
          <Logo collapsed />
        </span>
        <h2 className="t-title mt-3 text-ink">What can I help with?</h2>
        <p className="mt-1 max-w-[520px] text-sm text-muted">
          I can read your boards, docs and work, and make changes when you approve them.
        </p>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-2 max-sm:grid-cols-1">
        {STARTERS.map((starter) => (
          <button
            key={starter.command}
            className="flex items-start gap-2.5 rounded-[12px] border border-line bg-surface p-3 text-left hover:bg-surface-2"
            onClick={() => onCommand(starter.command)}
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-ai-soft text-ai">
              <starter.icon size={14} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{starter.title}</span>
              <span className="block t-meta text-muted">{starter.line}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
