import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { Dialog } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { useMe } from '../hooks/useMe';
import { useToast } from '../components/ui/Toast';
import { SettingsSection } from '../components/settings/SettingsSection';
import { relative } from '../lib/format';
import type { BackupInfo } from '../../../shared/types';

export function AdminDataTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const backups = useQuery({
    queryKey: ['backups'],
    queryFn: async () => (await api<{ backups: BackupInfo[] }>('GET', '/admin/backups')).backups,
  });

  return (
    <div>
      <SettingsSection
        title="Backups"
        description="A backup contains the database and uploads. Automatic daily backups keep the newest 7."
        actions={
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await api('POST', '/admin/backups');
                await qc.invalidateQueries({ queryKey: ['backups'] });
                toast.show('Backup created', 'success');
              } catch (err) {
                toast.show((err as Error).message, 'error');
              }
            }}
          >
            Create backup now
          </Button>
        }
      >
        <div className="border-y border-line">
          <div className="sticky top-0 z-10 grid h-9 grid-cols-[minmax(0,1fr)_70px_80px] items-center gap-3 border-b border-line bg-surface-2 px-2 md:grid-cols-[minmax(0,1fr)_100px_140px_90px]">
            <span className="t-label text-muted">Name</span>
            <span className="t-label hidden text-muted md:inline">Size</span>
            <span className="t-label text-muted">Created</span>
            <span className="t-label text-right text-muted">Action</span>
          </div>
          {backups.isLoading && (
            <div className="flex h-16 items-center justify-center text-muted">
              <Spinner size={14} />
            </div>
          )}
          {(backups.data ?? []).map((backup) => (
            <div
              key={backup.name}
              className="grid min-h-[var(--row-h)] grid-cols-[minmax(0,1fr)_70px_80px] items-center gap-3 border-b border-line px-2 py-1.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_100px_140px_90px]"
            >
              <span className="truncate text-ink">{backup.name}</span>
              <span className="t-meta hidden text-muted md:inline">
                {Math.round(backup.size / 1024)} KB
              </span>
              <span className="t-meta text-muted">{relative(backup.createdAt)}</span>
              <a
                className="text-right text-sm text-accent hover:underline"
                href={`/api/admin/backups/${backup.name}`}
              >
                Download
              </a>
            </div>
          ))}
          {backups.data?.length === 0 && (
            <p className="px-2 py-5 text-center text-sm text-muted">No backups yet.</p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Restore"
        description="Upload a .tar.gz backup. The current database and uploads are moved aside and the server restarts."
      >
        <label htmlFor="backup-file" className="t-label mb-1 block text-ink">
          Backup file
        </label>
        <input
          id="backup-file"
          type="file"
          accept=".gz,.tgz,application/gzip"
          className="text-sm text-ink"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (!window.confirm('Restore this backup and restart the server?')) return;
            const form = new FormData();
            form.append('file', file);
            await fetch('/api/admin/restore', {
              method: 'POST',
              headers: { 'X-Requested-With': 'tuesday' },
              body: form,
            });
            toast.show('Restore staged; waiting for the server to restart', 'success');
          }}
        />
      </SettingsSection>
      <OffsiteSection />
    </div>
  );
}

function OffsiteSection() {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [restoreName, setRestoreName] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const offsite = useQuery({
    queryKey: ['offsite-backups'],
    queryFn: () =>
      api<{
        configured: boolean;
        encrypted: boolean;
        keep: number;
        backups: {
          name: string;
          sizeBytes: number;
          encrypted: boolean;
          status: string;
          error: string | null;
          uploadedAt: string | null;
        }[];
      }>('GET', '/admin/backups/offsite'),
  });

  return (
    <SettingsSection
      title="Off-site copies"
      description="Every automatic backup can leave this machine, encrypted with AES-256-GCM."
      actions={
        <Button
          data-testid="offsite-upload"
          size="sm"
          disabled={!offsite.data?.configured}
          onClick={async () => {
            try {
              await api('POST', '/admin/backups/offsite', {});
              await qc.invalidateQueries({ queryKey: ['offsite-backups'] });
              toast.show('Off-site copy queued', 'success');
            } catch (error) {
              toast.show((error as Error).message, 'error');
            }
          }}
        >
          Upload latest now
        </Button>
      }
    >
      <div data-testid="offsite-backups">
        <p className="mb-2 t-meta text-muted">
          {offsite.data?.configured
            ? `Uploading${offsite.data.encrypted ? ', encrypted' : ''}, keeping ${offsite.data.keep}`
            : 'Not set up — see docs/OPERATIONS.md'}
        </p>
        <div className="border-y border-line">
          {(offsite.data?.backups ?? []).map((backup) => (
            <div
              key={backup.name}
              className="flex items-center gap-2 border-b border-line px-2 py-1.5 last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{backup.name}</span>
              {backup.encrypted && <span title="Encrypted">🔒</span>}
              <span className="t-meta text-muted">{Math.round(backup.sizeBytes / 1024)} KB</span>
              <span className="w-20 t-meta text-muted">
                {backup.uploadedAt ? relative(backup.uploadedAt) : backup.status}
              </span>
              <Button
                size="sm"
                variant="ghost"
                data-testid="offsite-restore"
                disabled={backup.status !== 'uploaded'}
                onClick={() => {
                  setRestoreName(backup.name);
                  setConfirm('');
                }}
              >
                Restore…
              </Button>
            </div>
          ))}
          {(offsite.data?.backups.length ?? 0) === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted">No off-site copies yet.</p>
          )}
        </div>
      </div>
      <Dialog
        open={Boolean(restoreName)}
        onOpenChange={(open) => !open && setRestoreName(null)}
        title="Restore from off-site"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestoreName(null)}>
              Cancel
            </Button>
            <Button
              disabled={confirm !== me.data?.org.name}
              onClick={async () => {
                if (!restoreName) return;
                await api(
                  'POST',
                  `/admin/backups/offsite/${encodeURIComponent(restoreName)}/restore`,
                  {
                    confirm,
                  },
                );
                toast.show('Restore staged. Restart Tuesday to apply it.', 'success');
                setRestoreName(null);
              }}
            >
              Restore and restart later
            </Button>
          </>
        }
      >
        <p className="mb-2 text-sm text-muted">
          Type the organisation name to confirm. Restart Tuesday after staging.
        </p>
        <Input
          aria-label="Organisation name"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder={me.data?.org.name}
        />
      </Dialog>
    </SettingsSection>
  );
}
