import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Sparkles } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/PageHeader';
import { QuickAddDialog } from '../home/QuickAddDialog';
import { openAi } from '../ai/openAi';

export function SharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [quickOpen, setQuickOpen] = useState(false);
  const title = params.get('title') ?? '';
  const text = params.get('text') ?? '';
  const url = params.get('url') ?? '';
  const name = title.trim() || text.trim().slice(0, 80) || 'Shared item';
  const shared = [text, url].filter(Boolean).join('\n\n');

  useEffect(() => {
    const installed = window.matchMedia?.('(display-mode: standalone)').matches;
    if (installed && (title || text || url)) setQuickOpen(true);
  }, [title, text, url]);

  return (
    <div data-testid="share-page" className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
      <PageHeader
        title="Share to Tuesday"
        description="Turn what you shared into work or a question."
      />
      <div className="max-w-[640px] rounded-[12px] border border-line bg-surface p-4">
        {title && <p className="text-sm font-semibold text-ink">{title}</p>}
        {text && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{text}</p>}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-sm text-accent"
          >
            {url}
          </a>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setQuickOpen(true)}>Create an item</Button>
          <Button
            variant="secondary"
            icon={<Sparkles size={14} className="text-ai" />}
            onClick={() => openAi(navigate, { q: [title, text, url].filter(Boolean).join('\n') })}
          >
            Ask Tuesday AI
          </Button>
        </div>
      </div>
      <QuickAddDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        initialName={name}
        initialText={shared}
      />
    </div>
  );
}
