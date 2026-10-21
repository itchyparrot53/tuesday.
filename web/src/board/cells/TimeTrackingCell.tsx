import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Square } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDuration } from '../../../../shared/columns';
import { Popover } from '../../components/ui/Popover';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import type { CellEditorProps } from './CellEditor';
import type { User } from '../../../../shared/types';

export function TimeTrackingCell({ column, item, boardId }: CellEditorProps) {
  const qc = useQueryClient();
  const value = item.values[String(column.id)] as
    { totalSeconds: number; runningSince: string | null; runningUserId: number | null } | undefined;
  const [now, setNow] = useState(Date.now());
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<{ user: User }>('GET', '/auth/me'),
  });
  const entries = useQuery({
    queryKey: ['time-entries', item.id, column.id],
    queryFn: async () =>
      (
        await api<{
          entries: {
            id: number;
            userName: string;
            startedAt: string;
            endedAt: string | null;
            seconds: number;
            note: string;
          }[];
        }>('GET', `/items/${item.id}/time/${column.id}/entries`)
      ).entries,
  });

  useEffect(() => {
    if (!value?.runningSince) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [value?.runningSince]);

  const runningMine =
    value?.runningSince && value.runningUserId === me.data?.user.id
      ? new Date(value.runningSince).getTime()
      : null;
  const elapsed = Math.max(0, Math.floor((now - Date.now()) / 1000));
  void elapsed;
  const total =
    (value?.totalSeconds ?? 0) +
    (runningMine ? Math.max(0, Math.floor((now - runningMine) / 1000)) : 0);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['items', boardId] });
    await qc.invalidateQueries({ queryKey: ['time-entries', item.id, column.id] });
    await qc.invalidateQueries({ queryKey: ['timer'] });
  }

  async function start() {
    await api('POST', `/items/${item.id}/time/${column.id}/start`);
    await refresh();
  }
  async function stop() {
    await api('POST', `/items/${item.id}/time/${column.id}/stop`);
    await refresh();
  }
  async function add() {
    const seconds = Number(hours || 0) * 3600 + Number(minutes || 0) * 60;
    if (seconds < 60) return;
    await api('POST', `/items/${item.id}/time/${column.id}/entries`, { seconds, note });
    setHours('');
    setMinutes('');
    setNote('');
    await refresh();
  }

  return (
    <div className="flex h-full w-full items-center gap-1">
      <button
        aria-label={runningMine ? 'Stop timer' : 'Start timer'}
        className="rounded-control p-0.5 text-muted hover:bg-sunken hover:text-ink"
        onClick={runningMine ? stop : start}
      >
        {runningMine ? <Square size={12} className="text-danger" /> : <Play size={12} />}
      </button>
      <Popover
        className="w-[280px]"
        trigger={
          <button
            className="min-w-0 flex-1 truncate text-left text-sm text-ink"
            title="Time entries"
          >
            {formatDuration(total)}
          </button>
        }
      >
        <div className="max-h-[220px] space-y-1 overflow-auto">
          {(entries.data ?? []).map((entry) => (
            <div key={entry.id} className="flex justify-between t-meta">
              <span className="truncate">
                {entry.userName} · {entry.startedAt.slice(0, 16).replace('T', ' ')}
              </span>
              <span className="text-muted">{formatDuration(entry.seconds)}</span>
            </div>
          ))}
          {(entries.data ?? []).length === 0 && (
            <p className="t-meta text-muted">No entries yet.</p>
          )}
        </div>
        <div className="mt-2 border-t border-line pt-2">
          <div className="mb-1 flex gap-1">
            <Input
              type="number"
              min={0}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder="h"
              className="h-7 w-14 text-sm"
            />
            <Input
              type="number"
              min={0}
              max={59}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              placeholder="m"
              className="h-7 w-14 text-sm"
            />
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Note"
              className="h-7 min-w-0 flex-1 text-sm"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={add}>
            Add time
          </Button>
        </div>
      </Popover>
    </div>
  );
}
