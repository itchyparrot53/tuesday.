import { rememberRecent } from '../lib/recent';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, MoreHorizontal, Sparkles } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { undoStack } from '../lib/undo';
import { useAiStatus } from '../hooks/useAiStatus';
import { Button } from '../components/ui/Button';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu';
import { PageHeader } from '../components/ui/PageHeader';
import { QueryError } from '../components/ui/QueryError';
import { Skeleton } from '../components/ui/Skeleton';
import { Segmented } from '../components/ui/Tabs';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import { DocEditor } from '../docs/DocEditor';
import { DocPreview } from '../docs/DocPreview';
import { VersionHistory } from '../docs/VersionHistory';
import { SummaryDialog } from '../ai/SummaryDialog';
import { MeetingNotesDialog } from '../ai/MeetingNotesDialog';
import { openAi } from '../ai/openAi';
import { FavoriteToggle } from '../components/FavoriteToggle';
import type { Doc } from '../../../shared/types';

export function DocPage() {
  const { id } = useParams();
  const docId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const ai = useAiStatus();
  const doc = useQuery({
    queryKey: ['doc', docId],
    queryFn: () => api<{ doc: Doc }>('GET', `/docs/${docId}`),
  });
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [version, setVersion] = useState(0);
  const [mode, setMode] = useState<'edit' | 'split' | 'preview'>('split');
  const [status, setStatus] = useState('Saved');
  const [conflict, setConflict] = useState<Doc | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const loaded = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!doc.data) return;
    rememberRecent({ kind: 'doc', id: doc.data.doc.id, name: doc.data.doc.title });
  }, [doc.data?.doc.id]);

  useEffect(() => {
    if (!doc.data || loaded.current) return;
    loaded.current = true;
    setTitle(doc.data.doc.title);
    setContent(doc.data.doc.content);
    setVersion(doc.data.doc.version);
  }, [doc.data?.doc.id]);

  useEffect(() => {
    if (!loaded.current) return;
    dirty.current = true;
    setStatus('Saving…');
    const timer = window.setTimeout(async () => {
      try {
        const result = await api<{ doc: Doc }>('PUT', `/docs/${docId}`, {
          title,
          content,
          baseVersion: version,
        });
        setVersion(result.doc.version);
        setStatus('Saved');
        dirty.current = false;
        setConflict(null);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          const details = err.details as { doc?: Doc } | undefined;
          setConflict(details?.doc ?? null);
          setStatus('Conflict');
        } else {
          setStatus('Offline');
        }
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [title, content]);

  if (doc.isError) {
    return (
      <div className="p-7">
        <QueryError onRetry={() => void doc.refetch()} />
      </div>
    );
  }

  if (doc.isLoading || !doc.data) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-line p-6">
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="space-y-3 p-6">
          {[0, 1, 2, 3, 4, 5].map((line) => (
            <Skeleton key={line} className="h-4 w-full max-w-[72ch]" />
          ))}
        </div>
      </div>
    );
  }

  async function loadLatest() {
    if (!conflict) return;
    setTitle(conflict.title);
    setContent(conflict.content);
    setVersion(conflict.version);
    setConflict(null);
    setStatus('Saved');
  }

  async function overwrite() {
    if (!conflict) return;
    try {
      const result = await api<{ doc: Doc }>('PUT', `/docs/${docId}`, {
        title,
        content,
        baseVersion: conflict.version,
      });
      setVersion(result.doc.version);
      setConflict(null);
      setStatus('Saved');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <PageHeader
        className="mb-0 border-b border-line px-6 py-3"
        title={
          <span className="flex items-center gap-2">
            <FileText size={18} className="shrink-0 text-accent" />
            <input
              value={title}
              aria-label="Doc title"
              onChange={(event) => setTitle(event.target.value)}
              className="t-title min-w-0 flex-1 bg-transparent text-ink outline-none"
            />
          </span>
        }
        description={<span className="t-meta text-muted">{status}</span>}
        actions={
          <>
            {doc.data && (
              <FavoriteToggle kind="doc" id={doc.data.doc.id} name={doc.data.doc.title} />
            )}
            {ai.data?.usable && doc.data && (
              <Button
                data-testid="ask-ai-here"
                variant="ghost"
                size="sm"
                aria-label="Ask AI about this"
                icon={<Sparkles size={14} className="text-ai" />}
                onClick={() => openAi(navigate, { docId: doc.data!.doc.id })}
              />
            )}
            <Segmented
              label="View mode"
              value={mode}
              onChange={(value) => setMode(value)}
              options={[
                { id: 'edit', label: 'Edit', title: 'Edit' },
                { id: 'split', label: 'Split', title: 'Split' },
                { id: 'preview', label: 'Preview', title: 'Preview' },
              ]}
            />
            <Menu
              trigger={
                <button
                  className="rounded-control p-1.5 text-muted hover:bg-sunken"
                  aria-label="Doc menu"
                >
                  <MoreHorizontal size={16} />
                </button>
              }
            >
              <MenuItem onSelect={() => setHistoryOpen(true)}>Version history</MenuItem>
              {ai.data?.usable && (
                <MenuItem onSelect={() => setSummaryOpen(true)}>Summarize</MenuItem>
              )}
              {ai.data?.usable && (
                <MenuItem onSelect={() => setMeetingOpen(true)}>Extract action items</MenuItem>
              )}
              <MenuSeparator />
              <MenuItem
                danger
                onSelect={async () => {
                  if (!window.confirm('Delete this doc?')) return;
                  await api('DELETE', `/docs/${docId}`);
                  undoStack.push({
                    label: 'Doc archived',
                    undo: async () => {
                      await api('POST', '/trash/restore', { kind: 'doc', id: docId });
                      await qc.invalidateQueries({ queryKey: ['workspaces'] });
                      navigate(`/docs/${docId}`);
                    },
                  });
                  await qc.invalidateQueries({ queryKey: ['workspaces'] });
                  toast.show('Doc archived', 'success');
                  navigate('/');
                }}
              >
                Delete
              </MenuItem>
            </Menu>
          </>
        }
      />

      {conflict && (
        <div
          data-testid="doc-conflict"
          className="flex items-center gap-2 border-b border-warning bg-warning-soft px-6 py-2 t-meta text-warning"
        >
          This doc changed while you were editing.
          <Button size="sm" variant="secondary" onClick={loadLatest}>
            Load latest
          </Button>
          <Button size="sm" variant="secondary" onClick={overwrite}>
            Overwrite with mine
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div
          className={
            mode === 'split'
              ? 'grid gap-6 lg:grid-cols-2 lg:divide-x lg:divide-line'
              : 'mx-auto max-w-[72ch]'
          }
        >
          {mode !== 'preview' && (
            <DocEditor
              value={content}
              onChange={setContent}
              aiUsable={Boolean(ai.data?.usable)}
              onExtract={() => setMeetingOpen(true)}
            />
          )}
          {mode !== 'edit' && <DocPreview content={content} />}
        </div>
      </div>

      <VersionHistory
        docId={docId}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestore={async (versionId) => {
          const result = await api<{ doc: Doc }>('POST', `/docs/${docId}/restore`, { versionId });
          setTitle(result.doc.title);
          setContent(result.doc.content);
          setVersion(result.doc.version);
          await qc.invalidateQueries({ queryKey: ['doc-versions', docId] });
          setHistoryOpen(false);
        }}
      />
      <SummaryDialog
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        kind="doc"
        id={docId}
        boardId={0}
      />
      <MeetingNotesDialog open={meetingOpen} onOpenChange={setMeetingOpen} initialText={content} />
    </div>
  );
}
