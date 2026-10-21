import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { GoLiveReport, GoLiveStatus } from '../../../shared/types';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { QueryError } from '../components/ui/QueryError';
import { SettingsSection } from '../components/settings/SettingsSection';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';

const TONES: Record<GoLiveStatus, string> = {
  pass: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  fail: 'bg-danger-soft text-danger-text',
};

export function AdminGoLiveTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const report = useQuery({
    queryKey: ['admin', 'go-live'],
    queryFn: () => api<GoLiveReport>('GET', '/admin/go-live'),
  });
  const [restoreDone, setRestoreDone] = useState(false);

  useEffect(() => {
    if (report.data) setRestoreDone(report.data.restoreDrillDone);
  }, [report.data?.restoreDrillDone]);

  async function setRestoreDrillDone(done: boolean) {
    setRestoreDone(done);
    const previous = qc.getQueryData<GoLiveReport>(['admin', 'go-live']);
    if (previous) {
      qc.setQueryData(['admin', 'go-live'], { ...previous, restoreDrillDone: done });
    }
    try {
      const next = await api<GoLiveReport>('PATCH', '/admin/go-live', {
        restoreDrillDone: done,
      });
      qc.setQueryData(['admin', 'go-live'], next);
      toast.show(done ? 'Restore drill recorded' : 'Restore drill cleared', 'success');
    } catch (error) {
      setRestoreDone(previous?.restoreDrillDone ?? false);
      if (previous) qc.setQueryData(['admin', 'go-live'], previous);
      toast.show((error as Error).message, 'error');
    }
  }

  return (
    <div data-testid="admin-go-live">
      <SettingsSection
        title="Go-live checklist"
        description="Live checks for the public URL, email, backups and launch settings. Warnings are not blockers, but every fail is."
        actions={
          <Button
            variant="secondary"
            onClick={() => void report.refetch()}
            loading={report.isFetching}
          >
            Recheck
          </Button>
        }
      >
        {report.isLoading && <Spinner size={16} />}
        {report.isError && <QueryError onRetry={() => void report.refetch()} />}
        {report.data && (
          <>
            <div className="border-t border-line">
              {report.data.checks.map((check) => (
                <div
                  key={check.id}
                  data-testid="go-live-row"
                  data-check={check.id}
                  data-status={check.status}
                  className="flex flex-wrap items-start gap-2 border-b border-line py-2 last:border-b-0"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 t-meta font-semibold ${TONES[check.status]}`}
                  >
                    {check.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{check.label}</p>
                    <p className="mt-0.5 t-meta text-muted">{check.detail}</p>
                  </div>
                  <Link to={check.href} className="t-meta text-accent hover:underline">
                    Open
                  </Link>
                </div>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink">
              <input
                data-testid="go-live-restore-drill"
                type="checkbox"
                checked={restoreDone}
                onChange={(event) => void setRestoreDrillDone(event.target.checked)}
              />
              Restore drill done
            </label>
            <p className="mt-1 t-meta text-muted">
              Tick this only after restoring a backup into a throwaway instance and confirming a
              board and item return.
            </p>
          </>
        )}
      </SettingsSection>
    </div>
  );
}
