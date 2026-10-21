import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useMe } from '../hooks/useMe';
import { useFavorites } from '../hooks/useFavorites';
import { useToast } from '../components/ui/Toast';
import { cn } from '../lib/cn';
import { isPastDate } from '../lib/format';
import { useUsers } from '../hooks/useUsers';
import { CellEditor } from '../board/cells/CellEditor';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { SkeletonRows } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { QueryError } from '../components/ui/QueryError';
import type { BoardFull, MyWorkBucket, MyWorkEntry, SavedQueueView } from '../../../shared/types';
import { BulkEditDialog } from '../home/BulkEditDialog';
import { useQueueActions } from '../home/useQueueActions';

const BUCKETS: { id: MyWorkBucket; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'this_week', label: 'This week' },
  { id: 'next_week', label: 'Next week' },
  { id: 'later', label: 'Later' },
  { id: 'no_date', label: 'No date' },
];

export function MyWorkPage() {
  const [params] = useSearchParams();
  const bucket = params.get('bucket');
  const [showDone, setShowDone] = useState(bucket === 'done');
  const [boardFilter, setBoardFilter] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState<'all' | 'overdue' | 'today' | 'upcoming'>('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [savedViewsOverride, setSavedViewsOverride] = useState<SavedQueueView[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (!bucket || bucket === 'open' || bucket === 'done') return new Set();
    return new Set(BUCKETS.filter((entry) => entry.id !== bucket).map((entry) => entry.id));
  });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const users = useUsers();
  const me = useMe();
  const savedViews = savedViewsOverride ?? me.data?.user.preferences.myWorkQueueViews ?? [];
  const favorites = useFavorites();
  const toast = useToast();
  const actions = useQueueActions();

  const work = useQuery({
    queryKey: ['my-work'],
    queryFn: () =>
      api<{ entries: MyWorkEntry[] }>('GET', `/my-work${showDone ? '?includeDone=1' : ''}`),
  });

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ['my-work'] });
  }, [showDone, qc]);

  useEffect(() => {
    setSelectedItems(new Set());
  }, [boardFilter, dateFilter, favoritesOnly, showDone]);

  async function persistViews(next: SavedQueueView[]) {
    setSavedViewsOverride(next);
    try {
      await api('PATCH', '/me', { preferences: { myWorkQueueViews: next } });
      await qc.invalidateQueries({ queryKey: ['me'] });
    } catch (error) {
      toast.show((error as Error).message, 'error');
    }
  }

  async function saveView() {
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
    await persistViews([...savedViews, view]);
    setSaveOpen(false);
    setViewName('');
    toast.show('View saved', 'success');
  }

  function applyView(view: SavedQueueView) {
    setBoardFilter(view.boardFilter);
    setDateFilter(view.dateFilter);
    setFavoritesOnly(view.favoritesOnly);
  }

  async function deleteView(id: string) {
    await persistViews(savedViews.filter((view) => view.id !== id));
  }

  const boardIds = [...new Set((work.data?.entries ?? []).map((entry) => entry.board.id))];
  const boards = useQueries({
    queries: boardIds.map((id) => ({
      queryKey: ['board', id],
      queryFn: () => api<BoardFull>('GET', `/boards/${id}`),
      staleTime: 30_000,
    })),
  });
  const boardMap = new Map<number, BoardFull>();
  boards.forEach((query, index) => {
    if (query.data) boardMap.set(boardIds[index], query.data);
  });

  if (work.isLoading || users.isLoading) {
    return (
      <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
        <PageHeader
          title="My work"
          description="Everything assigned to you, grouped by when it is due."
        />
        <SkeletonRows rows={8} />
      </div>
    );
  }

  const entries = work.data?.entries ?? [];
  const boardOptions = [
    { value: '', label: 'All boards' },
    ...[...new Map(entries.map((entry) => [entry.board.id, entry.board.name])).entries()].map(
      ([id, name]) => ({ value: String(id), label: name }),
    ),
  ];
  const filteredEntries = entries.filter((entry) => {
    if (boardFilter !== null && entry.board.id !== boardFilter) return false;
    if (favoritesOnly && !favorites.has('board', entry.board.id)) return false;
    if (dateFilter === 'overdue') return entry.bucket === 'overdue';
    if (dateFilter === 'today') return entry.bucket === 'today';
    if (dateFilter === 'upcoming')
      return ['this_week', 'next_week', 'later'].includes(entry.bucket);
    return true;
  });
  const activeView = savedViews.find(
    (view) =>
      view.boardFilter === boardFilter &&
      view.dateFilter === dateFilter &&
      view.favoritesOnly === favoritesOnly,
  );
  const selectedRows = filteredEntries
    .filter((entry) => selectedItems.has(`${entry.board.id}:${entry.item.id}`))
    .map((entry) => ({ entry, board: boardMap.get(entry.board.id) }));

  return (
    <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
      <PageHeader
        title="My work"
        description="Everything assigned to you, grouped by when it is due."
        actions={
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showDone}
              onChange={(event) => setShowDone(event.target.checked)}
            />
            Show done
          </label>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          ariaLabel="Filter My work by board"
          value={boardFilter ? String(boardFilter) : ''}
          onChange={(value) => setBoardFilter(value ? Number(value) : null)}
          options={boardOptions}
          size="sm"
          className="w-[220px]"
        />
        <div className="flex items-center rounded-control border border-line bg-surface p-0.5">
          {(['all', 'overdue', 'today', 'upcoming'] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-testid={`mywork-date-${value}`}
              aria-pressed={dateFilter === value}
              onClick={() => setDateFilter(value)}
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
          data-testid="mywork-favorites"
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly((value) => !value)}
          className={cn(
            'inline-flex h-7 items-center rounded-control border px-2 t-meta font-semibold',
            favoritesOnly
              ? 'border-accent bg-accent-soft text-accent-soft-ink'
              : 'border-line bg-surface text-muted hover:text-ink',
          )}
        >
          Favourites
        </button>
        {(boardFilter !== null || favoritesOnly || dateFilter !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setBoardFilter(null);
              setDateFilter('all');
              setFavoritesOnly(false);
            }}
            className="t-meta text-accent hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto t-meta text-muted">
          {filteredEntries.length} of {entries.length}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="t-label text-muted">Views</span>
        {savedViews.map((view) => (
          <span
            key={view.id}
            data-testid="mywork-saved-view"
            className={cn(
              'inline-flex items-center rounded-chip border',
              view.id === activeView?.id
                ? 'border-accent bg-accent-soft text-accent-soft-ink'
                : 'border-line bg-surface text-muted',
            )}
          >
            <button
              type="button"
              data-testid="mywork-apply-view"
              onClick={() => applyView(view)}
              className="py-0.5 pl-2 pr-1 t-meta font-semibold"
            >
              {view.name}
            </button>
            <button
              type="button"
              data-testid="mywork-delete-view"
              aria-label={`Delete view ${view.name}`}
              onClick={() => void deleteView(view.id)}
              className="py-0.5 pl-0.5 pr-1.5 text-muted hover:text-danger"
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          data-testid="mywork-save-view"
          onClick={() => {
            setViewName('');
            setSaveOpen(true);
          }}
          className="rounded-chip border border-dashed border-line px-2 py-0.5 t-meta text-muted hover:border-line-strong hover:text-ink"
        >
          Save view
        </button>
      </div>

      {selectedRows.length > 0 && (
        <div
          data-testid="mywork-bulk-bar"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-control border border-accent-soft bg-accent-soft px-2 py-1.5"
        >
          <span className="t-meta font-semibold text-accent-soft-ink">
            {selectedRows.length} selected
          </span>
          <Button
            data-testid="mywork-bulk-edit"
            size="sm"
            variant="secondary"
            onClick={() => setEditOpen(true)}
          >
            Edit fields
          </Button>
          <button
            type="button"
            className="t-meta text-muted hover:text-ink"
            onClick={() => setSelectedItems(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {work.isError && <QueryError onRetry={() => void work.refetch()} className="mb-6" />}

      {!work.isError && entries.length === 0 && (
        <EmptyState
          icon={<span className="t-section">◎</span>}
          title="Nothing assigned to you"
          description="Items you're added to show up here."
          className="pt-12"
        />
      )}

      {BUCKETS.map((bucket) => {
        const bucketEntries = filteredEntries.filter((entry) => entry.bucket === bucket.id);
        const isCollapsed = collapsed.has(bucket.id);
        return (
          <section
            key={bucket.id}
            data-testid="mywork-bucket"
            data-bucket={bucket.id}
            className="mb-4"
          >
            <button
              className={cn(
                'mb-2 flex items-center gap-1.5 t-section',
                bucket.id === 'today' ? 'text-accent' : 'text-ink',
              )}
              onClick={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(bucket.id)) next.delete(bucket.id);
                  else next.add(bucket.id);
                  return next;
                })
              }
            >
              {bucket.id === 'today' && <span className="h-5 w-[3px] rounded-full bg-accent" />}
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              {bucket.label}
              <span className="rounded-full bg-sunken px-1.5 t-meta text-muted">
                {bucketEntries.length}
              </span>
            </button>
            {!isCollapsed && (
              <div className="overflow-hidden rounded-[12px] border border-line bg-surface">
                {bucketEntries.length === 0 && (
                  <p className="px-4 py-3 text-sm text-muted">Nothing here.</p>
                )}
                {bucketEntries.map((entry) => {
                  const full = boardMap.get(entry.board.id);
                  const statusColumn = entry.statusColumnId
                    ? full?.columns.find((column) => column.id === entry.statusColumnId)
                    : undefined;
                  return (
                    <div
                      key={`${entry.board.id}-${entry.item.id}`}
                      className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        data-testid="mywork-select"
                        aria-label={`Select ${entry.item.name}`}
                        checked={selectedItems.has(`${entry.board.id}:${entry.item.id}`)}
                        onChange={() =>
                          setSelectedItems((previous) => {
                            const key = `${entry.board.id}:${entry.item.id}`;
                            const next = new Set(previous);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                        className="h-3.5 w-3.5 shrink-0 rounded-control border-line-strong"
                      />
                      <button
                        className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-accent"
                        onClick={() => navigate(`/boards/${entry.board.id}?item=${entry.item.id}`)}
                      >
                        {entry.item.name}
                      </button>
                      <span className="hidden shrink-0 t-meta text-muted sm:block">
                        {entry.board.name}
                      </span>
                      {statusColumn && full && (
                        <div className="w-[140px] shrink-0">
                          <CellEditor
                            column={statusColumn}
                            item={entry.item}
                            users={users.data?.byId ?? new Map()}
                            boardId={entry.board.id}
                            statusDone={entry.isDone}
                          />
                        </div>
                      )}
                      <span
                        className={cn(
                          'w-[90px] shrink-0 text-right t-meta',
                          entry.dueDate && isPastDate(entry.dueDate) && !entry.isDone
                            ? 'text-danger'
                            : 'text-muted',
                        )}
                      >
                        {entry.dueDate ?? '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <Dialog
        open={saveOpen}
        onOpenChange={(open) => {
          setSaveOpen(open);
          if (!open) setViewName('');
        }}
        title="Save My work view"
        description="Save the current board, date and favourites filters."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              data-testid="mywork-save-view-submit"
              disabled={!viewName.trim() || savedViews.length >= 20}
              onClick={saveView}
            >
              Save view
            </Button>
          </>
        }
      >
        <label htmlFor="mywork-view-name" className="mb-1 block t-label text-ink">
          Name
        </label>
        <Input
          id="mywork-view-name"
          value={viewName}
          maxLength={40}
          onChange={(event) => setViewName(event.target.value)}
          placeholder="e.g. My overdue"
          autoFocus
        />
      </Dialog>

      <BulkEditDialog
        rows={selectedRows}
        open={editOpen}
        onOpenChange={setEditOpen}
        onApply={(fields) => {
          void actions.bulkEdit(selectedRows, fields);
          setSelectedItems(new Set());
        }}
      />
    </div>
  );
}
