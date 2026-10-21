import { useEffect, useMemo, useState } from 'react';
import { useMatch, useNavigate } from 'react-router';
import { openAi } from '../ai/openAi';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { useMe } from '../hooks/useMe';
import { Dialog } from './ui/Dialog';
import { cn } from '../lib/cn';
import type { SearchResult } from '../../../shared/types';

interface Result {
  key: string;
  label: string;
  subtitle?: string;
  group: string;
  run: () => void | Promise<void>;
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const workspaces = useWorkspaces();
  const me = useMe();
  const match = useMatch('/boards/:id');
  const boardId = match ? Number(match.params.id) : null;
  const board = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api<import('../../../shared/types').BoardFull>('GET', `/boards/${boardId}`),
    enabled: Boolean(boardId),
  });
  const timer = useQuery({
    queryKey: ['timer'],
    queryFn: () =>
      api<{
        running: { itemId: number; columnId: number; startedAt: string } | null;
      }>('GET', '/me/timer'),
    refetchInterval: 15_000,
  });
  const [query, setQuery] = useState('');
  const [server, setServer] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setServer(null);
      setSelected(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setServer(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        setServer(await api<SearchResult>('GET', `/search?q=${encodeURIComponent(query.trim())}`));
      } catch {
        setServer(null);
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  const actions = useMemo<Result[]>(() => {
    const list: Result[] = [
      {
        key: 'new-item',
        label: 'New item',
        group: 'Actions',
        run: async () => {
          if (!boardId) return;
          const board = await api<{ groups: { id: number }[] }>('GET', `/boards/${boardId}`);
          await api('POST', `/boards/${boardId}/items`, {
            groupId: board.groups[0].id,
            name: query.trim() || 'New item',
          });
          await qc.invalidateQueries({ queryKey: ['items', boardId] });
        },
      },
      {
        key: 'new-board',
        label: 'Create board',
        group: 'Actions',
        run: () => {
          window.dispatchEvent(new CustomEvent('tuesday:create-board'));
        },
      },
      {
        key: 'new-dashboard',
        label: 'New dashboard',
        group: 'Actions',
        run: async () => {
          const workspace = workspaces.data?.[0];
          const board = workspace?.boards[0];
          if (!workspace || !board) return;
          const result = await api<{ dashboard: { id: number } }>('POST', '/dashboards', {
            workspaceId: workspace.id,
            name: query.trim() || 'Dashboard',
            boardIds: [board.id],
          });
          await qc.invalidateQueries({ queryKey: ['workspaces'] });
          navigate(`/dashboards/${result.dashboard.id}`);
        },
      },
      {
        key: 'open-automations',
        label: 'Open automations',
        group: 'Actions',
        run: () => {
          if (boardId) {
            navigate(`/boards/${boardId}`);
            window.setTimeout(
              () => window.dispatchEvent(new Event('tuesday:open-automations')),
              100,
            );
          }
        },
      },
      {
        key: 'new-doc',
        label: 'New doc',
        group: 'Actions',
        run: async () => {
          const workspace = workspaces.data?.[0];
          if (!workspace) return;
          const result = await api<{ doc: { id: number } }>('POST', '/docs', {
            workspaceId: workspace.id,
            title: query.trim() || 'Untitled doc',
          });
          await qc.invalidateQueries({ queryKey: ['workspaces'] });
          navigate(`/docs/${result.doc.id}`);
        },
      },
      {
        key: 'my-work',
        label: 'Go to My work',
        group: 'Actions',
        run: () => navigate('/my-work'),
      },
      { key: 'inbox', label: 'Go to Inbox', group: 'Actions', run: () => navigate('/inbox') },
      ...(me.data?.user.role === 'owner' || me.data?.user.role === 'admin'
        ? [
            {
              key: 'workflows',
              label: 'Go to Workflows',
              group: 'Actions',
              run: () => navigate('/workflows'),
            },
          ]
        : []),
      { key: 'trash', label: 'Go to Trash', group: 'Actions', run: () => navigate('/trash') },
      { key: 'admin', label: 'Go to Admin', group: 'Actions', run: () => navigate('/admin') },
      { key: 'profile', label: 'Go to Profile', group: 'Actions', run: () => navigate('/profile') },
      {
        key: 'toggle-sidebar',
        label: 'Toggle sidebar',
        group: 'Actions',
        run: () => window.dispatchEvent(new Event('tuesday:toggle-sidebar')),
      },
    ];
    if (timer.data?.running) {
      list.push({
        key: 'stop-timer',
        label: 'Stop my timer',
        group: 'Actions',
        run: async () => {
          const running = timer.data?.running;
          if (!running) return;
          await api('POST', `/items/${running.itemId}/time/${running.columnId}/stop`);
          await qc.invalidateQueries({ queryKey: ['timer'] });
        },
      });
    }
    for (const view of board.data?.views ?? []) {
      list.push({
        key: `view-${view.id}`,
        label: `Switch view: ${view.name}`,
        group: 'Actions',
        run: () => navigate(`/boards/${boardId}?view=${view.id}`),
      });
    }
    if (query.trim()) {
      list.push({
        key: 'ask-ai',
        label: `Ask Tuesday AI: ${query.trim()}`,
        group: 'Actions',
        run: () => openAi(navigate, { q: query.trim() }),
      });
    }
    list.push({
      key: 'new-ai-chat',
      label: 'New AI chat',
      group: 'Actions',
      run: () => openAi(navigate),
    });
    return list.filter((action) => action.label.toLowerCase().includes(query.trim().toLowerCase()));
  }, [boardId, board.data, navigate, query, qc, timer.data, workspaces.data]);

  const boards = (workspaces.data ?? []).flatMap((workspace) =>
    workspace.boards
      .filter((board) => board.name.toLowerCase().includes(query.trim().toLowerCase()))
      .slice(0, 6)
      .map((board) => ({
        key: `board-${board.id}`,
        label: board.name,
        subtitle: workspace.name,
        group: 'Boards',
        run: () => navigate(`/boards/${board.id}`),
      })),
  );
  const items = (server?.items ?? []).slice(0, 6).map((item) => ({
    key: `item-${item.id}`,
    label: item.name,
    subtitle: item.boardName,
    group: 'Items',
    run: () => navigate(`/boards/${item.boardId}?item=${item.id}`),
  }));
  const docs = (server?.docs ?? []).slice(0, 5).map((doc) => ({
    key: `doc-${doc.id}`,
    label: doc.title,
    subtitle: 'Doc',
    group: 'Docs',
    run: () => navigate(`/docs/${doc.id}`),
  }));
  const flat: Result[] = [...actions, ...boards, ...items, ...docs];

  async function run(result: Result) {
    onOpenChange(false);
    try {
      await result.run();
      const recent = JSON.parse(
        localStorage.getItem('tuesday:recent-commands') ?? '[]',
      ) as string[];
      localStorage.setItem(
        'tuesday:recent-commands',
        JSON.stringify(
          [result.label, ...recent.filter((entry) => entry !== result.label)].slice(0, 5),
        ),
      );
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Command palette" wide>
      <div data-testid="command-palette">
        <input
          data-testid="command-input"
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setSelected((current) => Math.min(flat.length - 1, current + 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setSelected((current) => Math.max(0, current - 1));
            }
            if (event.key === 'Enter' && flat[selected]) {
              event.preventDefault();
              void run(flat[selected]);
            }
            if (event.key === 'Escape') onOpenChange(false);
          }}
          placeholder="Type a command or search…"
          className="mb-3 h-10 w-full rounded-control border border-line bg-canvas px-3 text-sm outline-none focus:ring-2 focus:ring-accent/30"
        />
        <div className="max-h-[50vh] overflow-y-auto">
          {['Actions', 'Boards', 'Items', 'Docs'].map((group) => {
            const rows = flat.filter((result) => result.group === group);
            if (!rows.length) return null;
            return (
              <div key={group} className="mb-2">
                <p className="px-2 py-1 t-meta font-semibold text-muted">{group}</p>
                {rows.map((result) => {
                  const index = flat.indexOf(result);
                  return (
                    <button
                      key={result.key}
                      data-command-row
                      className={cn(
                        'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm',
                        index === selected
                          ? 'bg-accent-soft text-accent-soft-ink'
                          : 'hover:bg-sunken',
                      )}
                      onMouseEnter={() => setSelected(index)}
                      onClick={() => void run(result)}
                    >
                      <span className="min-w-0 flex-1 truncate">{result.label}</span>
                      {result.subtitle && (
                        <span className="t-meta text-muted">{result.subtitle}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {flat.length === 0 && <p className="px-2 py-4 text-sm text-muted">No matches.</p>}
        </div>
      </div>
    </Dialog>
  );
}
