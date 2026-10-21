import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import type { BoardDraft } from '../../../shared/ai';
import type { BoardFull, TemplateInfo } from '../../../shared/types';
import { api } from '../lib/api';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useAiStatus } from '../hooks/useAiStatus';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Select } from './ui/Select';
import { Input, Textarea } from './ui/Input';
import { UnderlineTabs } from './ui/Tabs';
import { Spinner } from './ui/Spinner';
import { useToast } from './ui/Toast';

type Tab = 'blank' | 'template' | 'ai';

export function CreateBoardDialog({
  open,
  onOpenChange,
  defaultTab = 'blank',
  defaultWorkspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: Tab;
  defaultWorkspaceId?: number;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const workspaces = useWorkspaces();
  const ai = useAiStatus();
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [workspaceId, setWorkspaceId] = useState(0);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [draft, setDraft] = useState<BoardDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api<{ templates: TemplateInfo[] }>('GET', '/templates')).templates,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setTab(defaultTab);
    setError('');
    setDraft(null);
    setTemplateId('');
    setName('');
    setPrompt('');
  }, [open, defaultTab]);

  useEffect(() => {
    const first = defaultWorkspaceId ?? workspaces.data?.[0]?.id ?? 0;
    if (!workspaceId && first) setWorkspaceId(first);
  }, [workspaces.data, workspaceId, defaultWorkspaceId]);

  const allWorkspaces = workspaces.data ?? [];

  async function submit() {
    if (!workspaceId) return;
    setBusy(true);
    setError('');
    try {
      let boardId: number;
      if (tab === 'blank') {
        const full = await api<BoardFull>('POST', '/boards', {
          workspaceId,
          name: name.trim() || 'New board',
        });
        boardId = full.board.id;
      } else if (tab === 'template') {
        if (!templateId) throw new Error('Choose a template');
        const full = await api<BoardFull>('POST', '/boards/from-template', {
          templateId,
          workspaceId,
          name: name.trim() || 'New board',
        });
        boardId = full.board.id;
      } else {
        let board = draft;
        if (!board) {
          if (!prompt.trim()) throw new Error('Describe the board you want');
          const generated = await api<{ draft: BoardDraft }>('POST', '/ai/generate-board', {
            workspaceId,
            prompt,
          });
          board = generated.draft;
          setDraft(board);
          return;
        }
        const full = await api<BoardFull>('POST', '/ai/create-board', {
          workspaceId,
          draft: board,
        });
        boardId = full.board.id;
      }
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      await qc.invalidateQueries({ queryKey: ['home'] });
      onOpenChange(false);
      toast.show('Board created', 'success');
      navigate(`/boards/${boardId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create board"
      wide
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            data-testid="create-board-submit"
            loading={busy}
            disabled={!workspaceId || (tab === 'template' && !templateId)}
            onClick={() => void submit()}
          >
            {tab === 'ai' && !draft ? 'Generate' : 'Create board'}
          </Button>
        </>
      }
    >
      <div data-testid="create-board-dialog" className="space-y-3">
        <UnderlineTabs
          tabs={[
            { id: 'blank', label: 'Blank', testId: 'create-board-tab' },
            { id: 'template', label: 'From a template', testId: 'create-board-tab' },
            { id: 'ai', label: 'Describe it', testId: 'create-board-tab' },
          ]}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          className="mb-2"
        />
        {tab === 'blank' && (
          <div className="space-y-3">
            <label className="block">
              <span className="t-label mb-1 block text-ink">Board name</span>
              <Input
                autoFocus
                aria-label="Board name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="New board"
              />
            </label>
            <label className="block">
              <span className="t-label mb-1 block text-ink">Workspace</span>
              <Select
                ariaLabel="Workspace"
                value={String(workspaceId)}
                onChange={(value) => setWorkspaceId(Number(value))}
                options={allWorkspaces.map((workspace) => ({
                  value: String(workspace.id),
                  label: workspace.name,
                }))}
              />
            </label>
          </div>
        )}
        {tab === 'template' && (
          <div className="space-y-3">
            <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
              {(templates.data ?? []).map((template) => (
                <button
                  key={template.id}
                  data-testid="template-card"
                  data-template-id={template.id}
                  className={`rounded-pop border p-2.5 text-left ${
                    templateId === template.id
                      ? 'border-accent bg-accent-soft'
                      : 'border-line hover:border-accent'
                  }`}
                  onClick={() => {
                    setTemplateId(template.id);
                    setName(template.name);
                  }}
                >
                  <p className="text-sm font-semibold text-ink">{template.name}</p>
                  <p className="t-meta text-muted">{template.description}</p>
                </button>
              ))}
            </div>
            <label className="block">
              <span className="t-label mb-1 block text-ink">Board name</span>
              <Input
                aria-label="Board name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          </div>
        )}
        {tab === 'ai' && (
          <div className="space-y-3">
            {!ai.data?.usable && (
              <p className="text-sm text-muted">
                AI isn't set up yet. Ask an admin to add an OpenRouter key.
              </p>
            )}
            <Textarea
              aria-label="Describe the board"
              rows={4}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. Hiring pipeline for 3 engineering roles"
              disabled={!ai.data?.usable}
            />
            {busy && (
              <p className="flex items-center gap-2 t-meta text-muted">
                <Spinner size={13} /> Designing your board…
              </p>
            )}
            {draft && (
              <div className="rounded-pop border border-line p-3">
                <p className="text-sm font-semibold text-ink">{draft.name}</p>
                <p className="t-meta text-muted">{draft.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {draft.columns.map((column) => (
                    <span
                      key={column.title}
                      className="rounded-chip bg-surface-2 px-1.5 py-0.5 t-meta text-muted"
                    >
                      {column.title}
                    </span>
                  ))}
                </div>
                <button
                  className="mt-2 inline-flex items-center gap-1 t-meta text-accent"
                  onClick={() => setDraft(null)}
                >
                  <Sparkles size={11} /> Try again
                </button>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-danger-text">{error}</p>}
      </div>
    </Dialog>
  );
}
