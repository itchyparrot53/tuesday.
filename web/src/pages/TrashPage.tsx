import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, FileText, LayoutDashboard, LayoutGrid, ListChecks, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { relative } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { QueryError } from '../components/ui/QueryError';
import { SkeletonRows } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useUsers } from '../hooks/useUsers';
import type { TrashEntry, TrashKind } from '../../../shared/types';

const kindIcon: Record<TrashKind, React.ReactNode> = {
  item: <ListChecks size={15} />,
  board: <LayoutGrid size={15} />,
  doc: <FileText size={15} />,
  dashboard: <LayoutDashboard size={15} />,
  workspace: <Boxes size={15} />,
};

export function TrashPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const users = useUsers();
  const [pending, setPending] = useState<TrashEntry | null>(null);
  const trash = useQuery({
    queryKey: ['trash'],
    queryFn: async () => (await api<{ entries: TrashEntry[] }>('GET', '/trash')).entries,
  });

  async function restore(entry: TrashEntry) {
    await api('POST', '/trash/restore', { kind: entry.kind, id: entry.id });
    await qc.invalidateQueries();
    toast.show('Restored', 'success');
  }

  async function purge(entry: TrashEntry) {
    await api('DELETE', `/trash/${entry.kind}/${entry.id}`);
    await qc.invalidateQueries();
    setPending(null);
    toast.show('Deleted forever', 'success');
  }

  const entries = trash.data ?? [];

  return (
    <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
      <PageHeader
        title="Trash"
        description="Archived items, boards, docs, dashboards and workspaces stay here for 30 days."
      />

      {trash.isLoading && <SkeletonRows rows={6} />}

      {trash.isError && <QueryError onRetry={() => void trash.refetch()} className="mt-4" />}

      {!trash.isLoading && !trash.isError && entries.length === 0 && (
        <EmptyState
          icon={<Trash2 size={22} />}
          title="Trash is empty."
          description="Archived items, boards, docs, dashboards and workspaces land here for 30 days."
          className="pt-12"
        />
      )}

      {entries.length > 0 && (
        <div className="border-y border-line bg-surface">
          <div className="sticky top-0 z-10 grid h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line bg-surface-2 px-3 md:grid-cols-[minmax(0,1fr)_160px_170px_220px]">
            <span className="t-label text-muted">Name</span>
            <span className="t-label hidden text-muted md:inline">Location</span>
            <span className="t-label hidden text-muted md:inline">Archived</span>
            <span className="t-label text-right text-muted">Actions</span>
          </div>
          {entries.map((entry) => {
            const actor = entry.archivedBy ? users.data?.byId.get(entry.archivedBy) : undefined;
            return (
              <div
                key={`${entry.kind}-${entry.id}`}
                data-testid="trash-row"
                data-kind={entry.kind}
                className="grid min-h-[var(--row-h)] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-1 last:border-b-0 hover:bg-surface-2 md:h-[var(--row-h)] md:grid-cols-[minmax(0,1fr)_160px_170px_220px] md:py-0"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-muted">{kindIcon[entry.kind]}</span>
                  <span className="min-w-0 truncate text-ink">
                    {entry.name}
                    <span className="t-meta ml-2 text-muted md:hidden">
                      {actor ? `${actor.name} · ` : ''}
                      {relative(entry.archivedAt)}
                    </span>
                  </span>
                  <span className="rounded-chip bg-sunken px-1.5 py-0.5 t-meta text-muted">
                    {entry.kind}
                  </span>
                </div>
                <span className="hidden truncate text-sm text-muted md:inline">
                  {entry.location}
                </span>
                <span className="t-meta hidden truncate text-muted md:inline">
                  {actor ? `${actor.name} · ` : ''}
                  {relative(entry.archivedAt)}
                </span>
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="secondary" onClick={() => restore(entry)}>
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="!text-danger-text hover:!bg-danger-soft"
                    onClick={() => setPending(entry)}
                  >
                    Delete forever
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!pending}
        onOpenChange={(open) => !open && setPending(null)}
        title="Delete forever?"
        description={
          pending
            ? `"${pending.name}" will be permanently deleted. This cannot be undone.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => pending && purge(pending)}>
              Delete forever
            </Button>
          </>
        }
      />
    </div>
  );
}
