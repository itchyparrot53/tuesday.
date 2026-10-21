import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  ChartGantt,
  ClipboardList,
  Columns3,
  MoreHorizontal,
  Lock,
  Sparkles,
  Share2,
  Webhook,
  Table2,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { undoStack } from '../lib/undo';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../lib/cn';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Dialog } from '../components/ui/Dialog';
import { PageHeader } from '../components/ui/PageHeader';
import { UnderlineTabs } from '../components/ui/Tabs';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/Menu';
import { useToast } from '../components/ui/Toast';
import { useDeleteView, useUpdateView } from './mutations';
import { ViewPicker } from './views/ViewPicker';
import { AutomationsPanel } from './AutomationsPanel';
import { FormBuilder } from './FormBuilder';
import { ImportDialog } from './ImportDialog';
import { BoardWebhookDialog } from './BoardWebhookDialog';
import { DuplicateBoardDialog } from './DuplicateBoardDialog';
import { SaveTemplateDialog } from './SaveTemplateDialog';
import { MeetingNotesDialog } from '../ai/MeetingNotesDialog';
import { useAiStatus } from '../hooks/useAiStatus';
import { SummaryDialog } from '../ai/SummaryDialog';
import { openAi } from '../ai/openAi';
import { FavoriteToggle } from '../components/FavoriteToggle';
import { ShareDialog } from './ShareDialog';
import type { BoardFull, View } from '../../../shared/types';

export function BoardHeader({ full }: { full: BoardFull }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(full.board.name);
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const updateView = useUpdateView(full.board.id);
  const deleteView = useDeleteView(full.board.id);

  const [renameView, setRenameView] = useState<View | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteViewTarget, setDeleteViewTarget] = useState<View | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [automateOpen, setAutomateOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const ai = useAiStatus();
  useEffect(() => {
    const open = () => setAutomateOpen(true);
    window.addEventListener('tuesday:open-automations', open);
    return () => window.removeEventListener('tuesday:open-automations', open);
  }, []);
  const automations = useQuery({
    queryKey: ['automations', full.board.id],
    queryFn: async () =>
      (await api<{ automations: { id: number }[] }>('GET', `/boards/${full.board.id}/automations`))
        .automations,
  });
  const [descOpen, setDescOpen] = useState(false);
  const [description, setDescription] = useState(full.board.description);
  const [deleteBoardOpen, setDeleteBoardOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const activeView = params.get('view');
  const item = params.get('item');

  async function save() {
    setEditing(false);
    if (!name.trim() || name === full.board.name) {
      setName(full.board.name);
      return;
    }
    await api('PATCH', `/boards/${full.board.id}`, { name });
    await qc.invalidateQueries({ queryKey: ['board', full.board.id] });
    await qc.invalidateQueries({ queryKey: ['workspaces'] });
  }

  const viewIcons = {
    table: <Table2 size={13} />,
    kanban: <Columns3 size={13} />,
    calendar: <CalendarDays size={13} />,
    timeline: <ChartGantt size={13} />,
  } as const;
  const currentView = full.views.find((view) => String(view.id) === activeView) ?? full.views[0];

  function selectView(viewId: string) {
    const next = new URLSearchParams(params);
    next.set('view', viewId);
    navigate(`?${next.toString()}`);
  }

  return (
    <div className="shrink-0 border-b border-line bg-surface px-5 pt-4">
      <PageHeader
        className="mb-3"
        title={
          editing ? (
            <input
              autoFocus
              aria-label="Board name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') {
                  setName(full.board.name);
                  setEditing(false);
                }
              }}
              className="w-full max-w-[520px] border-b border-accent bg-transparent text-inherit outline-none"
            />
          ) : (
            <span className="cursor-text" onClick={() => setEditing(true)}>
              {full.board.name}
            </span>
          )
        }
        description={
          <span
            className="cursor-text"
            onClick={() => {
              setDescription(full.board.description);
              setDescOpen(true);
            }}
          >
            {full.board.description || 'Add a description'}
          </span>
        }
        actions={
          <>
            <FavoriteToggle kind="board" id={full.board.id} name={full.board.name} />
            {full.board.myAccess === 'manage' && (
              <Button
                data-testid="board-share"
                variant="ghost"
                size="sm"
                icon={full.board.isPrivate ? <Lock size={14} /> : <Share2 size={14} />}
                onClick={() => setShareOpen(true)}
              >
                Share
              </Button>
            )}
            {ai.data?.usable && (
              <Button
                data-testid="ask-ai-here"
                variant="ghost"
                size="sm"
                aria-label="Ask AI about this"
                icon={<Sparkles size={14} className="text-ai" />}
                onClick={() => openAi(navigate, { boardId: full.board.id })}
              />
            )}
            <Button
              data-testid="automate-button"
              variant="ghost"
              size="sm"
              icon={<Zap size={14} />}
              onClick={() => setAutomateOpen(true)}
            >
              Automate
              {(automations.data?.length ?? 0) > 0 && (
                <span className="rounded-full bg-accent-soft px-1.5 t-meta text-accent-soft-ink">
                  {automations.data?.length}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<ClipboardList size={14} />}
              onClick={() => setFormOpen(true)}
            >
              Form
            </Button>
            <Menu
              trigger={
                <button
                  aria-label="Board menu"
                  title="Board menu"
                  className="rounded-control p-1.5 text-muted hover:bg-sunken hover:text-ink"
                >
                  <MoreHorizontal size={16} />
                </button>
              }
            >
              <MenuItem onSelect={() => setEditing(true)}>Rename board</MenuItem>
              <MenuItem
                onSelect={() => {
                  setDescription(full.board.description);
                  setDescOpen(true);
                }}
              >
                Edit description
              </MenuItem>
              <MenuSeparator />
              {ai.data?.usable && (
                <MenuItem onSelect={() => setSummaryOpen(true)}>✦ Summarize board</MenuItem>
              )}
              <MenuSeparator />
              <MenuItem onSelect={() => setDuplicateOpen(true)}>Duplicate board</MenuItem>
              <MenuItem onSelect={() => setSaveTemplateOpen(true)}>Save as template</MenuItem>
              <MenuItem onSelect={() => setMeetingOpen(true)}>Meeting notes → items</MenuItem>
              <MenuSeparator />
              <MenuItem
                onSelect={() => {
                  window.location.href = `/api/boards/${full.board.id}/export.csv`;
                }}
              >
                Export to CSV
              </MenuItem>
              <MenuItem onSelect={() => setImportOpen(true)}>Import from CSV</MenuItem>
              {full.board.myAccess === 'manage' && (
                <MenuItem onSelect={() => setWebhookOpen(true)}>
                  <span className="flex items-center gap-2">
                    <Webhook size={14} /> Inbound webhook…
                  </span>
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem danger onSelect={() => setDeleteBoardOpen(true)}>
                Delete board
              </MenuItem>
            </Menu>
          </>
        }
      />
      <div className="flex items-end gap-1">
        <UnderlineTabs
          className="min-w-0 flex-1"
          value={String(currentView?.id ?? '')}
          onChange={selectView}
          tabs={full.views.map((view) => ({
            id: String(view.id),
            label: view.name,
            icon: viewIcons[view.type],
          }))}
        />
        {currentView && full.views.length > 1 && (
          <Menu
            trigger={
              <button
                aria-label={`View menu for ${currentView.name}`}
                title={`View menu for ${currentView.name}`}
                className="mb-1 rounded-control p-1 text-muted hover:bg-sunken hover:text-ink"
              >
                <MoreHorizontal size={14} />
              </button>
            }
          >
            <MenuItem
              onSelect={() => {
                setRenameValue(currentView.name);
                setRenameView(currentView);
              }}
            >
              Rename view
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => setDeleteViewTarget(currentView)}>
              Delete view
            </MenuItem>
          </Menu>
        )}
        <ViewPicker full={full} />
      </div>

      <Dialog
        open={Boolean(renameView)}
        onOpenChange={(open) => !open && setRenameView(null)}
        title="Rename view"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameView(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (renameView && renameValue.trim()) {
                  updateView.mutate({
                    viewId: renameView.id,
                    name: renameValue.trim(),
                  });
                }
                setRenameView(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <label htmlFor="rename-view" className="t-label mb-1 block text-ink">
          Name
        </label>
        <Input
          id="rename-view"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          autoFocus
        />
      </Dialog>

      <Dialog
        open={Boolean(deleteViewTarget)}
        onOpenChange={(open) => !open && setDeleteViewTarget(null)}
        title="Delete view"
        description={`Delete "${deleteViewTarget?.name ?? ''}"?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteViewTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!deleteViewTarget) return;
                try {
                  await deleteView.mutateAsync(deleteViewTarget.id);
                  if (String(deleteViewTarget.id) === activeView)
                    navigate('/boards/' + full.board.id);
                } catch {
                  toast.show('A board must have at least one view', 'error');
                }
                setDeleteViewTarget(null);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">The view settings will be lost.</p>
      </Dialog>

      <AutomationsPanel full={full} open={automateOpen} onOpenChange={setAutomateOpen} />
      <FormBuilder full={full} open={formOpen} onOpenChange={setFormOpen} />
      <ImportDialog full={full} open={importOpen} onOpenChange={setImportOpen} />
      <BoardWebhookDialog
        boardId={full.board.id}
        open={webhookOpen}
        onOpenChange={setWebhookOpen}
      />
      <DuplicateBoardDialog
        boardId={full.board.id}
        defaultName={full.board.name}
        workspaceId={full.board.workspaceId}
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
      />
      <MeetingNotesDialog
        open={meetingOpen}
        onOpenChange={setMeetingOpen}
        initialBoardId={full.board.id}
      />
      <SaveTemplateDialog
        boardId={full.board.id}
        defaultName={full.board.name}
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
      />

      <ShareDialog
        boardId={full.board.id}
        open={shareOpen}
        onOpenChange={setShareOpen}
        isPrivate={full.board.isPrivate}
        onChanged={() => {
          void qc.invalidateQueries({ queryKey: ['board', full.board.id] });
        }}
      />

      <SummaryDialog
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        kind="board"
        id={full.board.id}
        boardId={full.board.id}
      />

      <Dialog
        open={descOpen}
        onOpenChange={setDescOpen}
        title="Edit description"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDescOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await api('PATCH', `/boards/${full.board.id}`, { description });
                await qc.invalidateQueries({ queryKey: ['board', full.board.id] });
                setDescOpen(false);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
          autoFocus
        />
      </Dialog>

      <Dialog
        open={deleteBoardOpen}
        onOpenChange={setDeleteBoardOpen}
        title="Delete board"
        description={`Delete "${full.board.name}"?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteBoardOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await api('DELETE', `/boards/${full.board.id}`);
                undoStack.push({
                  label: 'Board archived',
                  undo: async () => {
                    await api('POST', '/trash/restore', { kind: 'board', id: full.board.id });
                    await qc.invalidateQueries({ queryKey: ['workspaces'] });
                  },
                });
                await qc.invalidateQueries({ queryKey: ['workspaces'] });
                navigate(`/workspaces/${full.board.workspaceId}`);
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">Items and updates are archived with the board.</p>
      </Dialog>
    </div>
  );
}
