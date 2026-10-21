import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  FileText,
  LayoutDashboard,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';
import { useMe } from '../hooks/useMe';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useUsers } from '../hooks/useUsers';
import { useAiStatus } from '../hooks/useAiStatus';
import { labelStyle, useTheme } from '../lib/labelColors';
import { CreateBoardDialog } from '../components/CreateBoardDialog';
import { DescribeDashboardDialog } from '../dashboards/DescribeDashboardDialog';
import type { Dashboard } from '../../../shared/dashboards';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Menu, MenuItem } from '../components/ui/Menu';
import { PageHeader } from '../components/ui/PageHeader';
import { QueryError } from '../components/ui/QueryError';
import { SkeletonRows } from '../components/ui/Skeleton';
import { Spinner } from '../components/ui/Spinner';
import { Avatar } from '../components/ui/Avatar';
import { useToast } from '../components/ui/Toast';
import { RemoveWorkspaceDialog } from '../components/workspace/RemoveWorkspaceDialog';
import type { BoardFull, Workspace } from '../../../shared/types';

function updatedLabel(value?: string) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-7">
      <div className="mb-1 flex h-8 items-center justify-between border-b border-line">
        <h2 className="t-section text-ink">{title}</h2>
        <span className="t-meta text-muted">{count}</span>
      </div>
      {children}
    </section>
  );
}

function Row({
  to,
  icon,
  name,
  meta,
}: {
  to: string;
  icon: React.ReactNode;
  name: string;
  meta?: string | null;
}) {
  return (
    <Link
      to={to}
      className="group flex h-[var(--row-h)] items-center gap-3 border-b border-line px-1 text-ink last:border-b-0 hover:bg-surface-2"
    >
      <span className="text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      {meta && <span className="t-meta shrink-0 text-muted">{meta}</span>}
      <ChevronRight size={14} className="shrink-0 text-faint group-hover:text-muted" />
    </Link>
  );
}

export function WorkspacePage() {
  const { id } = useParams();
  const workspaceId = Number(id);
  const theme = useTheme();
  const workspaces = useWorkspaces();
  const me = useMe();
  const users = useUsers();
  const ai = useAiStatus();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();

  const workspace = workspaces.data?.find((w) => w.id === workspaceId);
  const canRemove = Boolean(
    workspace &&
    (me.data?.user.role === 'owner' ||
      me.data?.user.role === 'admin' ||
      workspace.createdBy === me.data?.user.id),
  );
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const [boardOpen, setBoardOpen] = useState(false);
  const [boardTab, setBoardTab] = useState<'blank' | 'template' | 'ai'>('blank');
  const [membersOpen, setMembersOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [describeDashboardOpen, setDescribeDashboardOpen] = useState(false);
  const [dashboardName, setDashboardName] = useState('');
  const [dashboardBoards, setDashboardBoards] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  useEffect(() => {
    if (workspace) setName(workspace.name);
  }, [workspace?.id, workspace?.name]);

  useEffect(() => {
    if (workspace) setSelected(workspace.memberIds);
  }, [membersOpen]);

  if (workspaces.isLoading) {
    return (
      <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
        <PageHeader title="Workspace" description="Loading this workspace." />
        <SkeletonRows rows={6} />
      </div>
    );
  }

  if (workspaces.isError) {
    return (
      <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
        <PageHeader title="Workspace" />
        <QueryError onRetry={() => void workspaces.refetch()} />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
        <PageHeader title="Workspace" description="This workspace could not be found." />
        <QueryError
          onRetry={() => void workspaces.refetch()}
          message="This workspace could not be found."
        />
      </div>
    );
  }

  async function renameWorkspace() {
    if (!name.trim() || name === workspace!.name) {
      setRenaming(false);
      return;
    }
    try {
      await api('PATCH', `/workspaces/${workspace!.id}`, { name });
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
    setRenaming(false);
  }

  async function saveMembers() {
    setSaving(true);
    try {
      await api<{ workspace: Workspace }>('PUT', `/workspaces/${workspace!.id}/members`, {
        userIds: selected,
      });
      await qc.invalidateQueries({ queryKey: ['workspaces'] });
      setMembersOpen(false);
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
      <PageHeader
        title={
          <div className="flex items-center gap-2.5">
            <span
              className="h-3 w-3 rounded-chip"
              style={{ backgroundColor: labelStyle(workspace.color, theme).solid }}
            />
            {renaming ? (
              <input
                autoFocus
                aria-label="Workspace name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={renameWorkspace}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') renameWorkspace();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                className="w-full max-w-[420px] border-b border-accent bg-transparent text-inherit outline-none"
              />
            ) : (
              <span className="cursor-text" onClick={() => setRenaming(true)}>
                {workspace.name}
              </span>
            )}
          </div>
        }
        description={workspace.description || 'No description yet.'}
        actions={
          <>
            {workspace.isPrivate && (
              <Button
                variant="secondary"
                size="sm"
                icon={<Users size={14} />}
                onClick={() => setMembersOpen(true)}
              >
                Members
              </Button>
            )}
            {canRemove && (
              <Menu
                trigger={
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<MoreHorizontal size={14} />}
                    aria-label="Workspace actions"
                  />
                }
              >
                <MenuItem danger onSelect={() => setRemoveOpen(true)}>
                  Remove workspace…
                </MenuItem>
              </Menu>
            )}
            <Menu
              trigger={
                <Button size="sm" icon={<Plus size={14} />}>
                  New
                </Button>
              }
            >
              <MenuItem
                onSelect={() => {
                  setBoardTab('blank');
                  setBoardOpen(true);
                }}
              >
                Board…
              </MenuItem>
              <MenuItem onSelect={() => setDescribeDashboardOpen(true)}>Dashboard…</MenuItem>
              <MenuItem
                onSelect={async () => {
                  const result = await api<{ doc: { id: number } }>('POST', '/docs', {
                    workspaceId: workspace.id,
                    title: 'Untitled doc',
                  });
                  await qc.invalidateQueries({ queryKey: ['workspaces'] });
                  navigate(`/docs/${result.doc.id}`);
                }}
              >
                Doc
              </MenuItem>
            </Menu>
          </>
        }
      />

      <Section title="Boards" count={workspace.boards.length}>
        {workspace.boards.length === 0 ? (
          <div className="grid gap-2 py-4 sm:grid-cols-3">
            {[
              { tab: 'template' as const, title: 'Start from a template', icon: LayoutGrid },
              { tab: 'ai' as const, title: 'Describe a board to AI', icon: Sparkles },
              { tab: 'blank' as const, title: 'Start blank', icon: Plus },
            ].map((card) => (
              <button
                key={card.tab}
                data-testid="workspace-start-card"
                data-tab={card.tab}
                className="flex items-center gap-2 rounded-[12px] border border-line bg-surface p-4 text-left text-sm font-medium text-ink hover:border-accent"
                onClick={() => {
                  setBoardTab(card.tab);
                  setBoardOpen(true);
                }}
              >
                <card.icon size={16} className="text-muted" />
                {card.title}
              </button>
            ))}
          </div>
        ) : (
          workspace.boards.map((board) => (
            <Row
              key={board.id}
              to={`/boards/${board.id}`}
              icon={<LayoutGrid size={16} />}
              name={board.name}
              meta={updatedLabel(board.updatedAt)}
            />
          ))
        )}
      </Section>

      <Section title="Dashboards" count={workspace.dashboards?.length ?? 0}>
        {(workspace.dashboards?.length ?? 0) === 0 ? (
          <EmptyState
            small
            icon={<LayoutDashboard size={20} />}
            title="No dashboards yet"
            description="Bring boards together in a dashboard."
            className="py-8"
          />
        ) : (
          workspace.dashboards?.map((dashboard) => (
            <Row
              key={dashboard.id}
              to={`/dashboards/${dashboard.id}`}
              icon={<LayoutDashboard size={16} />}
              name={dashboard.name}
              meta={updatedLabel(dashboard.updatedAt)}
            />
          ))
        )}
      </Section>

      <Section title="Docs" count={workspace.docs.length}>
        {workspace.docs.length === 0 ? (
          <EmptyState
            small
            icon={<FileText size={20} />}
            title="No docs yet"
            description="Write the thinking behind the work."
            className="py-8"
          />
        ) : (
          workspace.docs.map((doc) => (
            <Row
              key={doc.id}
              to={`/docs/${doc.id}`}
              icon={<FileText size={16} />}
              name={doc.title}
              meta={updatedLabel(doc.updatedAt)}
            />
          ))
        )}
      </Section>

      <DescribeDashboardDialog
        open={describeDashboardOpen}
        onOpenChange={setDescribeDashboardOpen}
        workspaceId={workspace.id}
      />
      <CreateBoardDialog
        open={boardOpen}
        onOpenChange={setBoardOpen}
        defaultWorkspaceId={workspace.id}
        defaultTab={boardTab}
      />

      <Dialog
        open={dashboardOpen}
        onOpenChange={setDashboardOpen}
        title="Create dashboard"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDashboardOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!dashboardName.trim() || dashboardBoards.length === 0}
              onClick={async () => {
                const result = await api<{ dashboard: Dashboard }>('POST', '/dashboards', {
                  workspaceId: workspace.id,
                  name: dashboardName,
                  boardIds: dashboardBoards,
                });
                await qc.invalidateQueries({ queryKey: ['workspaces'] });
                setDashboardOpen(false);
                setDashboardName('');
                setDashboardBoards([]);
                navigate(`/dashboards/${result.dashboard.id}`);
              }}
            >
              Create dashboard
            </Button>
          </>
        }
      >
        <label htmlFor="dashboard-name" className="t-label mb-1 block text-ink">
          Name
        </label>
        <Input
          id="dashboard-name"
          value={dashboardName}
          onChange={(event) => setDashboardName(event.target.value)}
          className="mb-3"
          autoFocus
        />
        <p className="t-label mb-1 text-ink">Boards</p>
        <div className="space-y-1">
          {workspace.boards.map((board) => (
            <label key={board.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dashboardBoards.includes(board.id)}
                onChange={(event) =>
                  setDashboardBoards((current) =>
                    event.target.checked
                      ? [...current, board.id]
                      : current.filter((id) => id !== board.id),
                  )
                }
              />
              {board.name}
            </label>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={membersOpen}
        onOpenChange={setMembersOpen}
        title="Workspace members"
        description="Only people selected here can open this private workspace."
        footer={
          <>
            <Button variant="secondary" onClick={() => setMembersOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={saveMembers}>
              Save
            </Button>
          </>
        }
      >
        <div className="max-h-[320px] space-y-1 overflow-auto">
          {users.data?.users.map((user) => (
            <label
              key={user.id}
              className="flex cursor-pointer items-center gap-2 rounded-control px-1 py-1.5 hover:bg-canvas"
            >
              <input
                type="checkbox"
                checked={selected.includes(user.id)}
                onChange={(e) =>
                  setSelected((prev) =>
                    e.target.checked ? [...prev, user.id] : prev.filter((x) => x !== user.id),
                  )
                }
              />
              <Avatar name={user.name} color={user.color} size={24} />
              <span className="text-sm">{user.name}</span>
              <span className="t-meta ml-auto text-muted">{user.email}</span>
            </label>
          ))}
        </div>
      </Dialog>
      <RemoveWorkspaceDialog
        workspace={workspace}
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        onRemoved={() => navigate('/')}
      />
    </div>
  );
}
