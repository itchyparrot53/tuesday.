import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { CheckCircle2, CircleSlash, Clock3, ExternalLink, AlertCircle } from 'lucide-react';
import type { Automation } from '../../../../shared/automations';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { relative } from '../../lib/format';
import { Select } from '../../components/ui/Select';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

interface RunRow {
  id: number;
  itemId: number | null;
  status: 'success' | 'failed' | 'skipped';
  error: string | null;
  createdAt: string;
}

const FILTERS = [
  { id: 'all', label: 'All runs' },
  { id: 'success', label: 'Succeeded' },
  { id: 'failed', label: 'Failed' },
  { id: 'skipped', label: 'Skipped' },
] as const;

function StatusBadge({ status }: { status: RunRow['status'] }) {
  const meta =
    status === 'success'
      ? { label: 'Succeeded', className: 'bg-success-soft text-success', icon: CheckCircle2 }
      : status === 'failed'
        ? { label: 'Failed', className: 'bg-danger-soft text-danger-text', icon: AlertCircle }
        : { label: 'Skipped', className: 'bg-sunken text-muted', icon: CircleSlash };
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 t-meta font-semibold',
        meta.className,
      )}
    >
      <Icon size={11} />
      {meta.label}
    </span>
  );
}

export function AutomationActivity({
  automations,
  initialAutomationId,
  onClose,
}: {
  automations: Automation[];
  initialAutomationId?: number | null;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<(typeof FILTERS)[number]['id']>('all');
  const [automationId, setAutomationId] = useState(
    initialAutomationId ? String(initialAutomationId) : 'all',
  );

  const results = useQueries({
    queries: automations.map((automation) => ({
      queryKey: ['automation-runs', automation.id],
      queryFn: async () =>
        (await api<{ runs: RunRow[] }>('GET', `/automations/${automation.id}/runs`)).runs,
      staleTime: 15_000,
    })),
  });

  const rows = useMemo(
    () =>
      results
        .flatMap((result, index) => {
          const automation = automations[index];
          return (result.data ?? []).map((run) => ({ ...run, automation }));
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [automations, results],
  );

  const stats = useMemo(
    () => ({
      total: rows.length,
      success: rows.filter((row) => row.status === 'success').length,
      failed: rows.filter((row) => row.status === 'failed').length,
      skipped: rows.filter((row) => row.status === 'skipped').length,
    }),
    [rows],
  );

  const visible = rows.filter(
    (row) =>
      (status === 'all' || row.status === status) &&
      (automationId === 'all' || String(row.automation.id) === automationId),
  );

  if (!automations.length) {
    return (
      <EmptyState
        icon={<Clock3 size={20} />}
        title="No runs yet"
        description="Once an automation fires, every success, skip and failure lands here."
      />
    );
  }

  const loading = results.some((result) => result.isLoading);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Total runs', value: stats.total, tone: 'text-ink' },
          { label: 'Succeeded', value: stats.success, tone: 'text-success' },
          { label: 'Failed', value: stats.failed, tone: 'text-danger-text' },
          { label: 'Skipped', value: stats.skipped, tone: 'text-muted' },
        ].map((item) => (
          <div key={item.label} className="rounded-pop border border-line bg-surface p-3">
            <p className="t-meta text-muted">{item.label}</p>
            <p className={cn('mt-0.5 t-section', item.tone)}>{item.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              onClick={() => setStatus(filter.id)}
              className={cn(
                'rounded-chip border px-2.5 py-1 t-meta font-semibold transition-colors',
                status === filter.id
                  ? 'border-accent bg-accent-soft text-accent-soft-ink'
                  : 'border-line text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="ml-auto w-full sm:w-[220px]">
          <Select
            ariaLabel="Filter by automation"
            value={automationId}
            options={[
              { value: 'all', label: 'All automations' },
              ...automations.map((automation) => ({
                value: String(automation.id),
                label: automation.name,
              })),
            ]}
            onChange={setAutomationId}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-sheet border border-line bg-surface px-5 py-10 text-center">
          <p className="t-label text-ink">{stats.total === 0 ? 'No runs yet' : 'No runs match'}</p>
          <p className="mt-1 text-sm text-muted">
            {stats.total === 0
              ? 'Runs appear here after an automation fires. Trigger one from the board, or wait for a schedule.'
              : 'Try another status filter, or wait for the next trigger.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-sheet border border-line bg-surface">
          {visible.slice(0, 200).map((run) => (
            <div
              key={`${run.automation.id}-${run.id}`}
              className="flex flex-wrap items-start gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink">{run.automation.name}</p>
                  <StatusBadge status={run.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {run.status === 'success'
                    ? 'All actions completed'
                    : (run.error ?? 'No detail recorded')}
                </p>
              </div>
              {run.itemId && (
                <Link
                  to={`/boards/${run.automation.boardId}?item=${run.itemId}`}
                  onClick={onClose}
                  className="inline-flex shrink-0 items-center gap-1 rounded-control border border-line px-2 py-1 t-meta font-medium text-muted hover:border-line-strong hover:text-ink"
                >
                  Open item <ExternalLink size={11} />
                </Link>
              )}
              <span className="shrink-0 t-meta text-muted" title={run.createdAt}>
                {relative(run.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
