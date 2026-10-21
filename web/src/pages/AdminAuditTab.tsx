import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AuditEntry, User } from '../../../shared/types';
import { api } from '../lib/api';
import { useUsers } from '../hooks/useUsers';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { relative } from '../lib/format';

const GROUPS = [
  { value: '', label: 'All actions' },
  { value: 'auth.', label: 'Sign-in' },
  { value: 'user.', label: 'People' },
  { value: 'board.', label: 'Boards' },
  { value: 'settings.', label: 'Settings' },
  { value: 'data.', label: 'Data' },
];

export function AdminAuditTab() {
  const users = useUsers();
  const [group, setGroup] = useState('');
  const [actorId, setActorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pages, setPages] = useState<AuditEntry[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const params = new URLSearchParams({ action: group, actorId, from, to, limit: '100' });
  if (before) params.set('before', String(before));
  const page = useQuery({
    queryKey: ['audit', group, actorId, from, to, before],
    queryFn: () =>
      api<{ entries: AuditEntry[]; nextBefore: number | null }>(
        'GET',
        `/admin/audit?${params.toString()}`,
      ),
  });
  const entries = [...pages, ...(page.data?.entries ?? [])];

  return (
    <div data-testid="admin-audit">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="t-label mb-1 block text-ink">Action</span>
          <Select
            ariaLabel="Action group"
            value={group}
            onChange={(value) => {
              setGroup(value);
              setPages([]);
              setBefore(null);
            }}
            options={GROUPS}
          />
        </label>
        <label className="block">
          <span className="t-label mb-1 block text-ink">Person</span>
          <Select
            ariaLabel="Person"
            value={actorId}
            onChange={(value) => {
              setActorId(value);
              setPages([]);
              setBefore(null);
            }}
            options={[
              { value: '', label: 'Anyone' },
              ...(users.data?.users ?? []).map((user: User) => ({
                value: String(user.id),
                label: user.name,
              })),
            ]}
          />
        </label>
        <label className="block">
          <span className="t-label mb-1 block text-ink">From</span>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="block">
          <span className="t-label mb-1 block text-ink">To</span>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <a
          data-testid="audit-export"
          href={`/api/admin/audit.csv?${params.toString()}`}
          className="inline-flex h-9 items-center rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-sunken"
        >
          Export CSV
        </a>
      </div>

      <div className="border-b border-line">
        <div className="grid h-9 grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_130px] items-center gap-2 border-b border-line bg-surface-2 px-2">
          <span className="t-label text-muted">Time</span>
          <span className="t-label text-muted">Actor</span>
          <span className="t-label text-muted">Action</span>
          <span className="t-label text-muted">Target</span>
        </div>
        {entries.map((entry) => (
          <div
            key={entry.id}
            data-testid="audit-row"
            className="grid min-h-[var(--row-h)] grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_130px] items-center gap-2 border-b border-line px-2 py-1 last:border-b-0 hover:bg-surface-2"
          >
            <span className="t-meta text-muted" title={entry.createdAt}>
              {relative(entry.createdAt)}
            </span>
            <span className="truncate text-sm text-ink">{entry.actorLabel}</span>
            <span className="truncate t-meta text-muted">{entry.action}</span>
            <span className="truncate t-meta text-muted" title={entry.ip}>
              {entry.targetLabel || entry.targetKind || '—'}
            </span>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="px-2 py-5 text-center text-sm text-muted">No audit entries.</p>
        )}
      </div>
      {page.data?.nextBefore && (
        <Button
          className="mt-3"
          variant="secondary"
          onClick={() => {
            setPages(entries);
            setBefore(page.data!.nextBefore);
          }}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
