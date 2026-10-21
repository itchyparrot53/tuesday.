import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Send } from 'lucide-react';
import { api } from '../lib/api';
import { postNdjson } from '../lib/ndjson';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Markdown } from '../components/ui/Markdown';
import { useToast } from '../components/ui/Toast';

export function SummaryDialog({
  open,
  onOpenChange,
  kind,
  id,
  boardId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'item' | 'board' | 'doc';
  id: number;
  boardId: number;
}) {
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!open) {
      abort.current?.abort();
      return;
    }
    setText('');
    setError('');
    setStreaming(true);
    const controller = new AbortController();
    abort.current = controller;
    postNdjson(
      '/ai/summarize',
      { kind, id },
      (event) => {
        if (event.type === 'text') setText((current) => current + event.delta);
        if (event.type === 'error') setError(event.message);
      },
      controller.signal,
    )
      .catch((err) => {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Something went wrong');
        }
      })
      .finally(() => setStreaming(false));
    return () => controller.abort();
  }, [open, kind, id]);

  const title = kind === 'item' ? 'Item summary' : kind === 'doc' ? 'Doc summary' : 'Board summary';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      wide
      footer={
        <>
          <Button
            variant="secondary"
            icon={<Copy size={14} />}
            disabled={!text}
            onClick={() => {
              navigator.clipboard.writeText(text);
              toast.show('Summary copied', 'success');
            }}
          >
            Copy
          </Button>
          {kind === 'item' && (
            <Button
              icon={<Send size={14} />}
              disabled={!text}
              onClick={async () => {
                try {
                  await api('POST', `/items/${id}/updates`, { body: text });
                  await qc.invalidateQueries({ queryKey: ['item', id] });
                  await qc.invalidateQueries({ queryKey: ['items', boardId] });
                  toast.show('Posted as an update', 'success');
                  onOpenChange(false);
                } catch (err) {
                  toast.show((err as Error).message, 'error');
                }
              }}
            >
              Post as update
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </>
      }
    >
      <div data-testid="summary-content" className="min-h-[140px] text-sm">
        {text ? <Markdown>{text}</Markdown> : null}
        {streaming && (
          <span
            aria-label="Summarizing"
            className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-ink align-middle motion-reduce:hidden"
          />
        )}
        {!streaming && !text && !error && <p className="text-muted">No summary was returned.</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </Dialog>
  );
}
