import { useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Lock,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  GitBranch,
  Home,
  Inbox,
  LayoutDashboard,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Shield,
} from 'lucide-react';
import { api } from '../../lib/api';
import { applyPrefs } from '../../lib/prefs';
import { useMe } from '../../hooks/useMe';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useNotifications } from '../../hooks/useNotifications';
import { useAiStatus } from '../../hooks/useAiStatus';
import { useFavorites } from '../../hooks/useFavorites';
import { labelStyle, useTheme } from '../../lib/labelColors';
import { Logo } from '../brand/Logo';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Kbd } from '../ui/Kbd';
import { Tooltip } from '../ui/Tooltip';
import { Menu, MenuItem, MenuSeparator } from '../ui/Menu';
import * as Popover from '@radix-ui/react-popover';
import { UserMenu } from './UserMenu';
import { OutboxBadge } from '../../pwa/OutboxBadge';
import { RemoveWorkspaceDialog } from '../workspace/RemoveWorkspaceDialog';
import type { Workspace } from '../../../../shared/types';
import { cn } from '../../lib/cn';

const treeClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'relative flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[6px] px-1.5 text-sm',
    isActive
      ? 'bg-accent-soft text-accent-soft-ink before:absolute before:bottom-1 before:left-0 before:top-1 before:w-[3px] before:rounded-full before:bg-accent'
      : 'text-ink hover:bg-sunken',
  );

function WorkspaceDotMenu({
  workspace,
  onNavigate,
}: {
  workspace: Workspace;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const theme = useTheme();
  const closeTimer = useRef<number | undefined>(undefined);
  const enter = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const leave = () => {
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          aria-label={`Open ${workspace.name}`}
          title={workspace.name}
          onMouseEnter={enter}
          onMouseLeave={leave}
          onClick={() => {
            navigate(`/workspaces/${workspace.id}`);
            onNavigate?.();
          }}
          className="flex h-8 w-full items-center justify-center rounded-[6px] hover:bg-sunken"
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: labelStyle(workspace.color, theme).solid }}
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={8}
          onMouseEnter={enter}
          onMouseLeave={leave}
          className="z-50 w-[230px] rounded-[10px] border border-line bg-surface p-1.5 shadow-pop outline-none"
        >
          <p className="truncate px-2 py-1 t-label font-semibold text-ink">{workspace.name}</p>
          {workspace.boards.map((board) => (
            <NavLink
              key={`b-${board.id}`}
              to={`/boards/${board.id}`}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className={treeClass}
            >
              <LayoutDashboard size={12} className="text-muted" />
              <span className="truncate">{board.name}</span>
            </NavLink>
          ))}
          {workspace.dashboards?.map((dashboard) => (
            <NavLink
              key={`d-${dashboard.id}`}
              to={`/dashboards/${dashboard.id}`}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className={treeClass}
            >
              <LayoutDashboard size={12} className="text-muted" />
              <span className="truncate">{dashboard.name}</span>
            </NavLink>
          ))}
          {workspace.docs?.map((doc) => (
            <NavLink
              key={`f-${doc.id}`}
              to={`/docs/${doc.id}`}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
              className={treeClass}
            >
              <FileText size={12} className="text-muted" />
              <span className="truncate">{doc.title}</span>
            </NavLink>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function Sidebar({
  onNavigate,
  onOpenMenu,
}: {
  onNavigate?: () => void;
  onOpenMenu?: () => void;
}) {
  const me = useMe();
  const theme = useTheme();
  const workspaces = useWorkspaces();
  const notifications = useNotifications();
  const ai = useAiStatus();
  const favorites = useFavorites();
  const isGuest = me.data?.user.isGuest ?? false;
  const shared = useQuery({
    queryKey: ['shared-boards'],
    queryFn: async () =>
      (await api<{ boards: { id: number; name: string }[] }>('GET', '/me/shared-boards')).boards,
    enabled: isGuest,
  });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [removeTarget, setRemoveTarget] = useState<Workspace | null>(null);
  const [workspaceOverrides, setWorkspaceOverrides] = useState<number[] | null>(null);
  const collapsed = me.data?.user.preferences.sidebarCollapsed ?? false;
  const isAdmin = me.data?.user.role === 'owner' || me.data?.user.role === 'admin';
  const timer = useQuery({
    queryKey: ['timer'],
    queryFn: () =>
      api<{
        running: {
          itemId: number;
          columnId: number;
          startedAt: string;
          itemName: string;
          boardId: number;
        } | null;
      }>('GET', '/me/timer'),
    refetchInterval: 15_000,
  });
  const unread = notifications.data?.unreadCount ?? 0;
  const running = timer.data?.running;

  async function setCollapsed(next: boolean) {
    if (!me.data) return;
    const prefs = { ...me.data.user.preferences, sidebarCollapsed: next };
    applyPrefs(prefs);
    await api('PATCH', '/me', { preferences: { sidebarCollapsed: next } });
    await qc.invalidateQueries({ queryKey: ['me'] });
  }

  const collapsedWorkspaceIds =
    workspaceOverrides ?? me.data?.user.preferences.collapsedWorkspaceIds ?? [];

  async function toggleWorkspace(workspaceId: number) {
    if (!me.data) return;
    const prefs = me.data.user.preferences;
    const next = collapsedWorkspaceIds.includes(workspaceId)
      ? collapsedWorkspaceIds.filter((id) => id !== workspaceId)
      : [...collapsedWorkspaceIds, workspaceId];
    setWorkspaceOverrides(next);
    applyPrefs({ ...prefs, collapsedWorkspaceIds: next });
    try {
      await api('PATCH', '/me', { preferences: { collapsedWorkspaceIds: next } });
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch {
      setWorkspaceOverrides(collapsedWorkspaceIds);
      applyPrefs(prefs);
    }
  }

  async function createWorkspace() {
    if (!name.trim()) return;
    const result = await api<{ workspace: { id: number } }>('POST', '/workspaces', { name });
    await qc.invalidateQueries({ queryKey: ['workspaces'] });
    setCreateOpen(false);
    setName('');
    navigate(`/workspaces/${result.workspace.id}`);
    onNavigate?.();
  }

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'group relative flex h-8 items-center gap-2 rounded-[6px] px-2.5 text-sm font-medium',
      isActive
        ? 'bg-accent-soft text-accent-soft-ink before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-[3px] before:rounded-full before:bg-accent'
        : 'text-ink hover:bg-sunken',
      collapsed && 'justify-center px-0',
    );

  const item = (label: string, icon: React.ReactNode) =>
    collapsed ? (
      <Tooltip label={label}>
        <span>{icon}</span>
      </Tooltip>
    ) : (
      <>
        {icon}
        <span className="truncate">{label}</span>
      </>
    );

  return (
    <div
      data-testid="sidebar"
      className={cn(
        'flex h-full shrink-0 flex-col bg-canvas transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-[248px]',
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-4',
          collapsed ? 'h-20 flex-col justify-center gap-1 px-0' : 'h-14',
        )}
      >
        <Logo collapsed={collapsed} />
        {!collapsed && (
          <button
            data-testid="sidebar-collapse"
            aria-label="Collapse sidebar"
            className="ml-auto rounded-control p-1 text-muted hover:bg-sunken hover:text-ink"
            onClick={() => setCollapsed(true)}
          >
            <ChevronsLeft size={15} />
          </button>
        )}
        {collapsed && (
          <button
            data-testid="sidebar-collapse"
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="rounded-[6px] p-1 text-muted hover:bg-sunken hover:text-ink"
            onClick={() => setCollapsed(false)}
          >
            <ChevronsRight size={15} />
          </button>
        )}
      </div>

      <div className={cn('px-3 pb-2', collapsed && 'px-2')}>
        <button
          data-testid="palette-trigger"
          className={cn(
            'flex h-8 w-full items-center gap-2 rounded-[8px] border border-line bg-surface px-2.5 text-sm text-muted hover:border-line-strong',
            collapsed && 'justify-center px-0',
          )}
          onClick={() => window.dispatchEvent(new Event('tuesday:open-palette'))}
        >
          <Search size={14} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search</span>
              <Kbd>⌘K</Kbd>
            </>
          )}
        </button>
      </div>

      <nav className={cn('space-y-0.5 px-3', collapsed && 'px-2')}>
        <NavLink to="/" end className={navClass} onClick={onNavigate}>
          {item('Home', <Home size={15} />)}
        </NavLink>
        <NavLink to="/my-work" className={navClass} onClick={onNavigate}>
          {item('My work', <PanelLeft size={15} />)}
        </NavLink>
        <NavLink to="/inbox" className={navClass} onClick={onNavigate}>
          {item('Inbox', <Inbox size={15} />)}
          {unread > 0 && !collapsed && (
            <Badge data-testid="notification-badge" tone="accent" className="ml-auto">
              {unread}
            </Badge>
          )}
        </NavLink>
        <button
          data-testid="ask-ai"
          className={cn(navClass({ isActive: false }), 'w-full')}
          onClick={() => window.dispatchEvent(new Event('tuesday:open-ai'))}
        >
          {item('Ask AI', <Sparkles size={15} className="text-ai" />)}
        </button>
      </nav>

      {!collapsed && (favorites.data?.length ?? 0) > 0 && (
        <div data-testid="sidebar-favorites" className="mt-4 px-3">
          <p className="mb-1 px-2 t-label text-muted">Favourites</p>
          {(favorites.data ?? []).map((favorite) => (
            <NavLink
              key={`${favorite.kind}-${favorite.id}`}
              to={
                favorite.kind === 'board'
                  ? `/boards/${favorite.id}`
                  : favorite.kind === 'doc'
                    ? `/docs/${favorite.id}`
                    : `/dashboards/${favorite.id}`
              }
              onClick={onNavigate}
              className={treeClass}
            >
              {favorite.kind === 'doc' ? (
                <FileText size={12} className="text-muted" />
              ) : (
                <LayoutDashboard size={12} className="text-muted" />
              )}
              <span className="truncate">{favorite.name}</span>
            </NavLink>
          ))}
        </div>
      )}

      <div
        className={cn(
          'mt-6 flex items-center gap-1 px-4',
          collapsed && 'justify-center px-0',
          isGuest && 'hidden',
        )}
      >
        {!collapsed && <span className="t-label text-muted">Workspaces</span>}
        <button
          aria-label="New workspace"
          className="ml-auto rounded-control p-0.5 text-muted hover:bg-sunken"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={14} />
        </button>
      </div>

      <div
        data-testid="sidebar-scroll"
        className={cn(
          'mt-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3',
          collapsed && 'px-2',
          isGuest && 'hidden',
        )}
      >
        {(workspaces.data ?? []).map((workspace) => {
          const isCollapsed = collapsedWorkspaceIds.includes(workspace.id);
          return (
            <div key={workspace.id} className="mb-1">
              {collapsed ? (
                <WorkspaceDotMenu workspace={workspace} onNavigate={onNavigate} />
              ) : (
                <>
                  <div className="group flex min-w-0 items-center gap-1">
                    <button
                      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${workspace.name}`}
                      aria-expanded={!isCollapsed}
                      onClick={() => void toggleWorkspace(workspace.id)}
                      className="shrink-0 rounded-control p-0.5 text-muted hover:bg-sunken hover:text-ink"
                    >
                      {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </button>
                    <button
                      className="flex h-7 min-w-0 flex-1 items-center gap-2 rounded-[6px] px-2 text-left text-sm font-semibold text-ink hover:bg-sunken"
                      onClick={() => {
                        navigate(`/workspaces/${workspace.id}`);
                        onNavigate?.();
                      }}
                      title={workspace.name}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: labelStyle(workspace.color, theme).solid }}
                      />
                      <span className="truncate">{workspace.name}</span>
                    </button>
                    <Menu
                      trigger={
                        <button
                          aria-label={`Actions for ${workspace.name}`}
                          className="rounded-control p-1 text-muted opacity-0 hover:bg-sunken hover:text-ink focus:opacity-100 group-hover:opacity-100"
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      }
                    >
                      <MenuItem
                        onSelect={() => {
                          navigate(`/workspaces/${workspace.id}`);
                          onNavigate?.();
                        }}
                      >
                        Open workspace
                      </MenuItem>
                      <MenuItem
                        onSelect={() => {
                          window.dispatchEvent(
                            new CustomEvent('tuesday:create-board', {
                              detail: { workspaceId: workspace.id },
                            }),
                          );
                          onNavigate?.();
                        }}
                      >
                        New board…
                      </MenuItem>
                      {(isAdmin || workspace.createdBy === me.data?.user.id) && (
                        <>
                          <MenuSeparator />
                          <MenuItem danger onSelect={() => setRemoveTarget(workspace)}>
                            Remove workspace…
                          </MenuItem>
                        </>
                      )}
                    </Menu>
                  </div>
                  {!isCollapsed && (
                    <div className="ml-3 border-l border-line pl-2">
                      {workspace.boards.map((board) => (
                        <div key={board.id} className="group flex min-w-0 items-center gap-1">
                          <NavLink
                            to={`/boards/${board.id}`}
                            onClick={onNavigate}
                            className={treeClass}
                            title={board.name}
                          >
                            <LayoutDashboard size={12} className="text-muted" />
                            <span className="truncate">{board.name}</span>
                            {board.isPrivate && <Lock size={10} className="shrink-0 text-faint" />}
                          </NavLink>
                          <Menu
                            trigger={
                              <button
                                aria-label={`Actions for ${board.name}`}
                                className="rounded-control p-1 text-muted opacity-0 hover:bg-sunken hover:text-ink focus:opacity-100 group-hover:opacity-100"
                              >
                                <MoreHorizontal size={12} />
                              </button>
                            }
                          >
                            <MenuItem
                              onSelect={() => {
                                navigate(`/boards/${board.id}`);
                                onNavigate?.();
                              }}
                            >
                              Open board
                            </MenuItem>
                          </Menu>
                        </div>
                      ))}
                      {workspace.dashboards?.map((dashboard) => (
                        <div key={dashboard.id} className="group flex min-w-0 items-center gap-1">
                          <NavLink
                            to={`/dashboards/${dashboard.id}`}
                            onClick={onNavigate}
                            className={treeClass}
                            title={dashboard.name}
                          >
                            <LayoutDashboard size={12} className="text-muted" />
                            <span className="truncate">{dashboard.name}</span>
                          </NavLink>
                          <Menu
                            trigger={
                              <button
                                aria-label={`Actions for ${dashboard.name}`}
                                className="rounded-control p-1 text-muted opacity-0 hover:bg-sunken hover:text-ink focus:opacity-100 group-hover:opacity-100"
                              >
                                <MoreHorizontal size={12} />
                              </button>
                            }
                          >
                            <MenuItem
                              onSelect={() => {
                                navigate(`/dashboards/${dashboard.id}`);
                                onNavigate?.();
                              }}
                            >
                              Open dashboard
                            </MenuItem>
                          </Menu>
                        </div>
                      ))}
                      {workspace.docs?.map((doc) => (
                        <div key={doc.id} className="group flex min-w-0 items-center gap-1">
                          <NavLink
                            to={`/docs/${doc.id}`}
                            onClick={onNavigate}
                            className={treeClass}
                            title={doc.title}
                          >
                            <FileText size={12} className="text-muted" />
                            <span className="truncate">{doc.title}</span>
                          </NavLink>
                          <Menu
                            trigger={
                              <button
                                aria-label={`Actions for ${doc.title}`}
                                className="rounded-control p-1 text-muted opacity-0 hover:bg-sunken hover:text-ink focus:opacity-100 group-hover:opacity-100"
                              >
                                <MoreHorizontal size={12} />
                              </button>
                            }
                          >
                            <MenuItem
                              onSelect={() => {
                                navigate(`/docs/${doc.id}`);
                                onNavigate?.();
                              }}
                            >
                              Open doc
                            </MenuItem>
                          </Menu>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {isGuest && (
        <div data-testid="sidebar-shared" className="mt-4 px-3">
          <p className="mb-1 px-2 t-label text-muted">Shared with me</p>
          {(shared.data ?? []).map((board) => (
            <NavLink
              key={board.id}
              to={`/boards/${board.id}`}
              onClick={onNavigate}
              className={treeClass}
            >
              <LayoutDashboard size={12} className="text-muted" />
              <span className="truncate">{board.name}</span>
            </NavLink>
          ))}
        </div>
      )}

      <div className={cn('space-y-0.5 px-3 pb-2', collapsed && 'px-2')}>
        {isAdmin && (
          <NavLink to="/workflows" className={navClass} onClick={onNavigate}>
            {item('Workflows', <GitBranch size={15} />)}
          </NavLink>
        )}
        {!isGuest && (
          <NavLink to="/trash" className={navClass} onClick={onNavigate}>
            {item('Trash', <Trash2 size={15} />)}
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/admin" className={navClass} onClick={onNavigate}>
            {item('Admin', <Shield size={15} />)}
          </NavLink>
        )}
      </div>

      {running && !collapsed && (
        <button
          className="mx-3 mb-2 rounded-[8px] border border-line bg-surface px-2 py-1.5 text-left t-meta hover:border-line-strong"
          onClick={() => navigate(`/boards/${running.boardId}?item=${running.itemId}`)}
        >
          <span className="block truncate font-semibold text-ink">{running.itemName}</span>
          <span className="text-muted">Timer running</span>
        </button>
      )}

      <div className={cn('border-t border-line p-2', collapsed && 'px-2')}>
        {!collapsed && (
          <div className="px-4 pb-1">
            <OutboxBadge />
          </div>
        )}
        <UserMenu collapsed={collapsed} />
      </div>

      <RemoveWorkspaceDialog
        workspace={removeTarget}
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        onRemoved={() => {
          navigate('/');
          onNavigate?.();
        }}
      />

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New workspace"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!name.trim()} onClick={createWorkspace}>
              Create workspace
            </Button>
          </>
        }
      >
        <label htmlFor="new-workspace-name" className="t-label mb-1 block text-ink">
          Name
        </label>
        <Input
          id="new-workspace-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </Dialog>
    </div>
  );
}
