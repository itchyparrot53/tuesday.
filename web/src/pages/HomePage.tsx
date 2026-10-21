import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  Bookmark,
  CheckCircle2,
  ChevronDown,
  FileText,
  LayoutDashboard,
  ListTodo,
  Plus,
  Search,
  Star,
  X,
} from 'lucide-react';
import type { BoardFull, HomeSummary, SavedQueueView } from '../../../shared/types';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { greeting } from '../lib/format';
import { useMe } from '../hooks/useMe';
import { useWorkspaces } from '../hooks/useWorkspaces';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Kbd } from '../components/ui/Kbd';
import { useToast } from '../components/ui/Toast';
import { Menu, MenuItem } from '../components/ui/Menu';
import { QueryError } from '../components/ui/QueryError';
import { Skeleton } from '../components/ui/Skeleton';
import { SummaryLine } from '../home/SummaryLine';
import { AskBox } from '../home/AskBox';
import { FocusCard, useQueueBoard } from '../home/FocusCard';
import { FocusQueue } from '../home/FocusQueue';
import { HomeRail } from '../home/HomeRail';
import { QuickAddDialog } from '../home/QuickAddDialog';
import { CreateBoardDialog } from '../components/CreateBoardDialog';
import { DescribeDashboardDialog } from '../dashboards/DescribeDashboardDialog';
import { GettingStarted } from '../home/GettingStarted';
import { Tour } from '../home/Tour';
import { buildQueue, type QueueEntry } from '../home/queue';
import { useQueueActions } from '../home/useQueueActions';

function KeyboardHints() {
  return (
    <div className="mt-3 hidden flex-wrap items-center gap-x-4 gap-y-2 t-meta text-muted md:flex">
      <span className="inline-flex items-center gap-1">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd> move
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>X</Kbd> complete
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>S</Kbd> snooze
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>Enter</Kbd> open
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>/</Kbd> search
      </span>
    </div>
  );
}

function EmptyQueue({
  summary,
  isGuest,
  onOpenMyWork,
  onCreateBoard,
}: {
  summary: HomeSummary;
  isGuest: boolean;
  onOpenMyWork: () => void;
  onCreateBoard: () => void;
}) {
  const open = summary.counts.open;
  return (
    <div
      data-testid="home-empty"
      className="rounded-sheet border border-line bg-surface px-6 py-10 text-center"
    >
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
        <CheckCircle2 size={22} />
      </span>
      <h2 className="mt-3 t-section text-ink">Queue cleared</h2>
      <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted">
        Nothing is due today or in the next three days.
        {open > 0
          ? ` ${open} more open ${open === 1 ? 'item is' : 'items are'} waiting in My work.`
          : ''}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" onClick={onOpenMyWork}>
          Open My work
        </Button>
        {!isGuest && <Button onClick={onCreateBoard}>New board</Button>}
      </div>
    </div>
  );
}

function FilteredEmpty({ onClear }: { onClear: () => void }) {
  return (
    <div className="rounded-sheet border border-line bg-surface px-6 py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sunken text-muted">
        <ListTodo size={22} />
      </span>
      <h2 className="mt-3 t-section text-ink">No items match</h2>
      <p className="mx-auto mt-1 max-w-[46ch] text-sm text-muted">
        Nothing in your queue matches these filters.
      </p>
      <Button variant="secondary" className="mt-4" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}

export function HomePage() {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const workspaces = useWorkspaces();
  const actions = useQueueActions();
  const toast = useToast();
  const [quickAdd, setQuickAdd] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [describeDashboardOpen, setDescribeDashboardOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const [boardFilter, setBoardFilter] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedQueueView[]>([]);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const home = useQuery({
    queryKey: ['home'],
    queryFn: () => api<HomeSummary>('GET', '/home'),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === 'item') {
      setQuickAdd(true);
      params.delete('new');
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}`;
      window.history.replaceState({}, '', next);
    }
  }, []);

  useEffect(() => {
    if (tourOpen || !me.data || me.data.user.preferences.tourDone) return;
    if (window.innerWidth < 768) return;
    const timer = window.setTimeout(() => {
      if (!document.querySelector('[role="dialog"]')) setTourOpen(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [me.data, tourOpen]);

  useEffect(() => {
    const start = () => setTourOpen(true);
    window.addEventListener('tuesday:start-tour', start);
    return () => window.removeEventListener('tuesday:start-tour', start);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void qc.invalidateQueries({ queryKey: ['home'] });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [qc]);

  const summary = home.data;

  useEffect(() => {
    if (!me.data || filtersLoaded) return;
    const prefs = me.data.user.preferences;
    setBoardFilter(prefs.homeBoardFilter ?? null);
    setDateFilter(prefs.homeDateFilter ?? 'all');
    setFavoritesOnly(prefs.homeFavoritesOnly ?? false);
    setSavedViews(prefs.savedQueueViews ?? []);
    setFiltersLoaded(true);
  }, [me.data, filtersLoaded]);

  const queueAll = useMemo(() => (summary ? buildQueue(summary) : []), [summary]);
  const favoriteBoardIds = useMemo(
    () =>
      new Set((summary?.boards ?? []).filter((board) => board.favorite).map((board) => board.id)),
    [summary],
  );
  const filteredQueue = useMemo(
    () =>
      queueAll.filter((entry) => {
        if (boardFilter !== null && entry.board.id !== boardFilter) return false;
        if (favoritesOnly && !favoriteBoardIds.has(entry.board.id)) return false;
        if (dateFilter === 'overdue' && entry.bucket !== 'overdue') return false;
        if (dateFilter === 'today' && entry.bucket !== 'today') return false;
        if (
          dateFilter === 'upcoming' &&
          !['this_week', 'next_week', 'later'].includes(entry.bucket)
        )
          return false;
        return true;
      }),
    [queueAll, boardFilter, favoritesOnly, favoriteBoardIds, dateFilter],
  );
  const queue = useMemo(() => filteredQueue.slice(0, 12), [filteredQueue]);
  const boardOptions = useMemo(() => {
    const boards = new Map<number, string>();
    for (const card of summary?.boards ?? []) {
      boards.set(card.id, `${card.workspaceName} › ${card.name}`);
    }
    for (const entry of queueAll) {
      if (!boards.has(entry.board.id)) boards.set(entry.board.id, entry.board.name);
    }
    return [
      { value: '', label: 'All boards' },
      ...[...boards.entries()].map(([id, label]) => ({ value: String(id), label })),
    ];
  }, [summary, queueAll]);

  useEffect(() => {
    setSelected(0);
  }, [boardFilter, dateFilter, favoritesOnly]);

  function saveFilters(patch: {
    homeBoardFilter?: number | null;
    homeDateFilter?: 'all' | 'overdue' | 'today' | 'upcoming';
    homeFavoritesOnly?: boolean;
  }) {
    void api('PATCH', '/me', { preferences: patch }).then(() =>
      qc.invalidateQueries({ queryKey: ['me'] }),
    );
  }

  function clearFilters() {
    setBoardFilter(null);
    setDateFilter('all');
    setFavoritesOnly(false);
    saveFilters({ homeBoardFilter: null, homeDateFilter: 'all', homeFavoritesOnly: false });
  }

  function persistViews(next: SavedQueueView[]) {
    setSavedViews(next);
    void api('PATCH', '/me', { preferences: { savedQueueViews: next } }).then(() =>
      qc.invalidateQueries({ queryKey: ['me'] }),
    );
  }

  function applyView(view: SavedQueueView) {
    setBoardFilter(view.boardFilter);
    setDateFilter(view.dateFilter);
    setFavoritesOnly(view.favoritesOnly);
    saveFilters({
      homeBoardFilter: view.boardFilter,
      homeDateFilter: view.dateFilter,
      homeFavoritesOnly: view.favoritesOnly,
    });
  }

  function saveView() {
    const name = viewName.trim();
    if (!name) return;
    if (savedViews.length >= 20) {
      toast.show('You can save up to 20 views. Delete one first.', 'error');
      return;
    }
    if (savedViews.some((view) => view.name.toLowerCase() === name.toLowerCase())) {
      toast.show('A view with that name already exists', 'error');
      return;
    }
    const view: SavedQueueView = {
      id:
        globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name,
      boardFilter,
      dateFilter,
      favoritesOnly,
    };
    persistViews([...savedViews, view]);
    setSaveViewOpen(false);
    setViewName('');
    toast.show('View saved', 'success');
  }

  function deleteView(id: string) {
    persistViews(savedViews.filter((view) => view.id !== id));
  }
  const hero = queue[0];
  const rest = useMemo(() => queue.slice(1), [queue]);
  const heroBoard = useQueueBoard(hero?.board.id ?? 0);

  useEffect(() => {
    if (selected > queue.length - 1) {
      setSelected(Math.max(0, queue.length - 1));
    }
  }, [queue.length, selected]);

  useEffect(() => {
    const row = document.querySelector<HTMLElement>(`[data-queue-index="${selected}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing =
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      if (event.key === '/') {
        event.preventDefault();
        window.dispatchEvent(new Event('tuesday:open-palette'));
        return;
      }
      if (!queue.length) return;
      const entry = queue[selected] ?? queue[0];
      const key = event.key.toLowerCase();
      if (key === 'j') {
        event.preventDefault();
        setSelected((current) => Math.min(queue.length - 1, current + 1));
      } else if (key === 'k') {
        event.preventDefault();
        setSelected((current) => Math.max(0, current - 1));
      } else if (key === 'x') {
        const board = qc.getQueryData<BoardFull>(['board', entry.board.id]);
        if (board) void actions.complete(entry, board);
      } else if (key === 's') {
        const board = qc.getQueryData<BoardFull>(['board', entry.board.id]);
        if (board) void actions.snooze(entry, board);
      } else if (event.key === 'Enter') {
        if (target.closest('button, a')) return;
        event.preventDefault();
        navigate(`/boards/${entry.board.id}?item=${entry.item.id}`);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [actions, navigate, qc, queue, selected]);

  async function finishTour() {
    setTourOpen(false);
    await api('PATCH', '/me', { preferences: { tourDone: true } });
    await qc.invalidateQueries({ queryKey: ['me'] });
    await qc.invalidateQueries({ queryKey: ['home'] });
  }

  async function createDoc() {
    const workspace = workspaces.data?.[0];
    if (!workspace) return;
    const result = await api<{ doc: { id: number } }>('POST', '/docs', {
      workspaceId: workspace.id,
      title: 'Untitled doc',
    });
    await qc.invalidateQueries({ queryKey: ['workspaces'] });
    navigate(`/docs/${result.doc.id}`);
  }

  async function createDashboard() {
    const workspace = workspaces.data?.[0];
    const board = workspace?.boards[0];
    if (!workspace) return;
    const result = await api<{ dashboard: { id: number } }>('POST', '/dashboards', {
      workspaceId: workspace.id,
      name: 'Untitled dashboard',
      boardIds: board ? [board.id] : [],
    });
    await qc.invalidateQueries({ queryKey: ['workspaces'] });
    navigate(`/dashboards/${result.dashboard.id}`);
  }

  const first = me.data?.user.name.split(' ')[0] ?? '';
  const isGuest = me.data?.user.isGuest ?? false;
  const date = summary ? format(parseISO(summary.today), 'EEEE d MMMM') : '';
  const workspaceName = hero
    ? summary?.boards.find((board) => board.id === hero.board.id)?.workspaceName
    : undefined;
  const activeView = savedViews.find(
    (view) =>
      view.boardFilter === boardFilter &&
      view.dateFilter === dateFilter &&
      view.favoritesOnly === favoritesOnly,
  );

  function openItem(entry: QueueEntry) {
    navigate(`/boards/${entry.board.id}?item=${entry.item.id}`);
  }

  if (home.isLoading) {
    return (
      <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4 max-md:py-5">
        <div className="mx-auto max-w-[1240px]">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-80" />
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <Skeleton className="h-6 w-24" />
              <Skeleton className="mt-3 h-[248px] w-full rounded-sheet" />
              <Skeleton className="mt-6 h-6 w-40" />
              <Skeleton className="mt-3 h-[280px] w-full rounded-sheet" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-28 w-full rounded-sheet" />
              <Skeleton className="h-44 w-full rounded-sheet" />
              <Skeleton className="h-32 w-full rounded-sheet" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (home.isError || !summary) {
    return (
      <div className="p-7">
        <QueryError onRetry={() => void home.refetch()} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4 max-md:py-5">
      <div className="mx-auto max-w-[1240px]">
        <PageHeader
          title={`${greeting()}, ${first}`}
          description={`${date} · Your queue is ranked by what is late, then what is due next.`}
          actions={
            <>
              <button
                type="button"
                aria-label="Search or jump to"
                onClick={() => window.dispatchEvent(new Event('tuesday:open-palette'))}
                className="hidden h-9 items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-sm text-muted transition-colors hover:bg-sunken sm:flex"
              >
                <Search size={14} />
                <span className="hidden lg:inline">Search or jump to</span>
                <Kbd className="hidden lg:inline-flex">⌘K</Kbd>
              </button>
              <div className="hidden md:block">
                <AskBox className="w-[250px]" />
              </div>
              <Menu
                align="end"
                trigger={
                  <button
                    data-testid="home-new"
                    aria-label="New"
                    className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent px-3 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
                  >
                    <Plus size={15} />
                    <span className="hidden sm:inline">New</span>
                    <ChevronDown size={13} />
                  </button>
                }
              >
                <MenuItem onSelect={() => setQuickAdd(true)}>
                  <ListTodo size={14} /> Item
                </MenuItem>
                {!isGuest && (
                  <>
                    <MenuItem onSelect={() => setBoardOpen(true)}>
                      <LayoutDashboard size={14} /> Board…
                    </MenuItem>
                    <MenuItem onSelect={() => void createDoc()}>
                      <FileText size={14} /> Doc
                    </MenuItem>
                    <MenuItem onSelect={() => setDescribeDashboardOpen(true)}>
                      <LayoutDashboard size={14} /> Dashboard
                    </MenuItem>
                  </>
                )}
              </Menu>
            </>
          }
        >
          <div className="mt-3">
            <SummaryLine summary={summary} />
          </div>
        </PageHeader>

        <GettingStarted state={summary.onboarding} onStartTour={() => setTourOpen(true)} />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="next-up" className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Select
                ariaLabel="Filter by board"
                value={boardFilter ? String(boardFilter) : ''}
                onChange={(value) => {
                  const next = value ? Number(value) : null;
                  setBoardFilter(next);
                  saveFilters({ homeBoardFilter: next });
                }}
                options={boardOptions}
                size="sm"
                className="w-[220px]"
              />
              <div className="flex items-center rounded-control border border-line bg-surface p-0.5">
                {(['all', 'overdue', 'today', 'upcoming'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    data-testid={`home-date-${value}`}
                    aria-pressed={dateFilter === value}
                    onClick={() => {
                      setDateFilter(value);
                      saveFilters({ homeDateFilter: value });
                    }}
                    className={cn(
                      'h-6 rounded-[6px] px-2 t-meta font-semibold',
                      dateFilter === value
                        ? 'bg-accent-soft text-accent-soft-ink'
                        : 'text-muted hover:text-ink',
                    )}
                  >
                    {value === 'all'
                      ? 'All'
                      : value === 'overdue'
                        ? 'Overdue'
                        : value === 'today'
                          ? 'Today'
                          : 'Upcoming'}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-pressed={favoritesOnly}
                onClick={() => {
                  const next = !favoritesOnly;
                  setFavoritesOnly(next);
                  saveFilters({ homeFavoritesOnly: next });
                }}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-control border px-2 t-meta font-semibold',
                  favoritesOnly
                    ? 'border-accent bg-accent-soft text-accent-soft-ink'
                    : 'border-line bg-surface text-muted hover:text-ink',
                )}
              >
                <Star size={12} className={favoritesOnly ? 'fill-current' : ''} />
                Favourites
              </button>
              {(boardFilter !== null || favoritesOnly || dateFilter !== 'all') && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="t-meta text-accent hover:underline"
                >
                  Clear
                </button>
              )}
              <span className="ml-auto t-meta text-muted">
                {filteredQueue.length} of {queueAll.length}
              </span>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <span className="t-label text-muted">Views</span>
              {savedViews.map((view) => {
                const active = view.id === activeView?.id;
                return (
                  <span
                    key={view.id}
                    data-testid="home-saved-view"
                    className={cn(
                      'inline-flex items-center rounded-chip border',
                      active
                        ? 'border-accent bg-accent-soft text-accent-soft-ink'
                        : 'border-line bg-surface text-muted',
                    )}
                  >
                    <button
                      type="button"
                      data-testid="home-apply-view"
                      onClick={() => applyView(view)}
                      className="py-0.5 pl-2 pr-1 t-meta font-semibold"
                    >
                      {view.name}
                    </button>
                    <button
                      type="button"
                      data-testid="home-delete-view"
                      aria-label={`Delete view ${view.name}`}
                      onClick={() => deleteView(view.id)}
                      className="py-0.5 pl-0.5 pr-1.5 text-muted hover:text-danger"
                    >
                      <X size={11} />
                    </button>
                  </span>
                );
              })}
              <button
                type="button"
                data-testid="home-save-view"
                onClick={() => {
                  setViewName('');
                  setSaveViewOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded-chip border border-dashed border-line px-2 py-0.5 t-meta text-muted hover:border-line-strong hover:text-ink"
              >
                <Bookmark size={11} /> Save view
              </button>
              {savedViews.length === 0 && (
                <span className="t-meta text-muted">Save a filter combination for later.</span>
              )}
            </div>

            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 id="next-up" className="t-label text-muted">
                Next up
              </h2>
              <span className="t-meta text-muted">
                {filteredQueue.length === queueAll.length
                  ? `${queue.length} due soon`
                  : `Showing ${queue.length} of ${filteredQueue.length}`}
              </span>
            </div>

            {hero ? (
              <div data-testid="home-focus">
                <FocusCard
                  entry={hero}
                  board={heroBoard.data}
                  workspaceName={workspaceName}
                  today={summary.today}
                  position={1}
                  total={queue.length}
                  selected={selected === 0}
                  busy={actions.isBusy(hero.item.id)}
                  onComplete={() => {
                    if (heroBoard.data) void actions.complete(hero, heroBoard.data);
                  }}
                  onSnooze={() => {
                    if (heroBoard.data) void actions.snooze(hero, heroBoard.data);
                  }}
                  onStatus={(labelId, name) => {
                    if (heroBoard.data) void actions.setStatus(hero, heroBoard.data, labelId, name);
                  }}
                  onOpen={() => openItem(hero)}
                />
              </div>
            ) : queueAll.length === 0 ? (
              <EmptyQueue
                summary={summary}
                isGuest={isGuest}
                onOpenMyWork={() => navigate('/my-work')}
                onCreateBoard={() => setBoardOpen(true)}
              />
            ) : (
              <FilteredEmpty onClear={clearFilters} />
            )}

            {rest.length > 0 && (
              <div className="mt-6">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <h2 className="t-label text-muted">The rest of the queue</h2>
                  <Link to="/my-work" className="t-meta text-accent hover:underline">
                    All open work
                  </Link>
                </div>
                <p className="mb-2 t-meta text-muted">Next 3 days, ranked by due date.</p>
                <FocusQueue
                  entries={rest}
                  offset={1}
                  today={summary.today}
                  selected={selected}
                  isBusy={actions.isBusy}
                  onSelect={setSelected}
                  onComplete={(entry, board) => void actions.complete(entry, board)}
                  onSnooze={(entry, board) => void actions.snooze(entry, board)}
                  onStatus={(entry, board, labelId, name) =>
                    void actions.setStatus(entry, board, labelId, name)
                  }
                  onOpen={openItem}
                  onBulkComplete={actions.bulkComplete}
                  onBulkSnooze={actions.bulkSnooze}
                  onBulkEdit={actions.bulkEdit}
                />
              </div>
            )}

            {filteredQueue.length > queue.length && (
              <p className="mt-3 t-meta text-muted">
                <Link to="/my-work" className="text-accent hover:underline">
                  See all {filteredQueue.length} matching items in My work
                </Link>
              </p>
            )}

            {hero && <KeyboardHints />}
          </section>

          <HomeRail summary={summary} />
        </div>
      </div>

      <Dialog
        open={saveViewOpen}
        onOpenChange={(open) => {
          setSaveViewOpen(open);
          if (!open) setViewName('');
        }}
        title="Save queue view"
        description="Save the current board, date and favourites filters."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveViewOpen(false)}>
              Cancel
            </Button>
            <Button
              data-testid="home-save-view-submit"
              disabled={!viewName.trim() || savedViews.length >= 20}
              onClick={saveView}
            >
              Save view
            </Button>
          </>
        }
      >
        <label htmlFor="queue-view-name" className="mb-1 block t-label text-ink">
          Name
        </label>
        <Input
          id="queue-view-name"
          value={viewName}
          maxLength={40}
          onChange={(event) => setViewName(event.target.value)}
          placeholder="e.g. My overdue"
          autoFocus
        />
        {savedViews.length >= 20 && (
          <p className="mt-2 t-meta text-muted">
            You can save up to 20 views. Delete one to make room.
          </p>
        )}
      </Dialog>

      <QuickAddDialog open={quickAdd} onOpenChange={setQuickAdd} />
      <CreateBoardDialog open={boardOpen} onOpenChange={setBoardOpen} />
      <DescribeDashboardDialog
        open={describeDashboardOpen}
        onOpenChange={setDescribeDashboardOpen}
        workspaceId={workspaces.data?.[0]?.id ?? 0}
      />
      <Tour open={tourOpen} onDone={() => void finishTour()} />
    </div>
  );
}
