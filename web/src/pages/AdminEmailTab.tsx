import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EmailDnsReport,
  EmailDnsRow,
  EmailLogEntry,
  EmailStatus,
} from '../../../shared/types';
import { api } from '../lib/api';
import { Button } from '../components/ui/Button';
import { Spinner } from '../components/ui/Spinner';
import { useToast } from '../components/ui/Toast';
import { SettingsSection } from '../components/settings/SettingsSection';
import { relative } from '../lib/format';

const TONES: Record<EmailLogEntry['status'], string> = {
  sent: 'bg-success-soft text-success',
  failed: 'bg-danger-soft text-danger-text',
  skipped: 'bg-sunken text-muted',
  queued: 'bg-warning-soft text-warning',
};

const DNS_TONES: Record<EmailDnsRow['status'], string> = {
  found: 'bg-success-soft text-success',
  missing: 'bg-danger-soft text-danger-text',
  external: 'bg-sunken text-muted',
};

function DnsRow({ label, row, detail }: { label: string; row: EmailDnsRow; detail?: string }) {
  return (
    <div
      data-testid={`email-dns-${label.toLowerCase()}`}
      className="border-b border-line py-2 last:border-b-0"
    >
      <div className="flex items-center gap-2">
        <span className="t-label text-ink">{label}</span>
        <span className={`rounded-full px-2 py-0.5 t-meta font-semibold ${DNS_TONES[row.status]}`}>
          {row.status}
        </span>
      </div>
      {row.value && <p className="mt-1 break-all t-meta text-ink">{row.value}</p>}
      {detail && <p className="mt-1 t-meta text-muted">{detail}</p>}
      <p className="mt-1 t-meta text-muted">{row.fix}</p>
      {row.error && <p className="mt-1 t-meta text-muted">DNS note: {row.error}</p>}
    </div>
  );
}

export function AdminEmailTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [dns, setDns] = useState<EmailDnsReport | null>(null);
  const [dnsLoading, setDnsLoading] = useState(false);
  const status = useQuery({
    queryKey: ['admin', 'email'],
    queryFn: () => api<EmailStatus>('GET', '/admin/email'),
  });
  const log = useQuery({
    queryKey: ['admin', 'email', 'log'],
    queryFn: () => api<{ entries: EmailLogEntry[] }>('GET', '/admin/email/log?limit=50'),
    refetchInterval: 5000,
  });

  const tone =
    status.data?.mode === 'smtp'
      ? 'bg-success-soft text-success'
      : status.data?.mode === 'fake'
        ? 'bg-warning-soft text-warning'
        : 'bg-sunken text-muted';
  const label =
    status.data?.mode === 'smtp'
      ? 'Connected'
      : status.data?.mode === 'fake'
        ? 'Fake'
        : 'Not set up';

  async function checkDomain() {
    setDnsLoading(true);
    try {
      setDns(await api<EmailDnsReport>('GET', '/admin/email/dns'));
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setDnsLoading(false);
    }
  }

  return (
    <div data-testid="admin-email">
      <SettingsSection
        title="Email"
        description="Outgoing mail uses SMTP. Admins can send a test message and see the last 50 sends."
        actions={
          <Button
            data-testid="email-test"
            disabled={status.data?.mode === 'off'}
            onClick={async () => {
              try {
                await api('POST', '/admin/email/test');
                toast.show('Test email queued', 'success');
                await qc.invalidateQueries({ queryKey: ['admin', 'email'] });
              } catch (error) {
                toast.show((error as Error).message, 'error');
              }
            }}
          >
            Send test email
          </Button>
        }
      >
        {status.isLoading ? (
          <Spinner size={16} />
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 t-meta font-semibold ${tone}`}>
                {label}
              </span>
              {status.data?.host && (
                <span className="t-meta text-muted">
                  {status.data.host}:{status.data.port}
                </span>
              )}
            </div>
            <p className="t-meta text-muted">From: {status.data?.from ?? 'Not set'}</p>
            {status.data?.lastSentAt && (
              <p className="t-meta text-muted">Last sent {relative(status.data.lastSentAt)}</p>
            )}
            {status.data?.lastError && (
              <p className="t-meta text-danger-text">Last error: {status.data.lastError}</p>
            )}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        title="Domain health"
        description="Check the sender domain's SPF, DMARC, MX and DKIM before sending real mail."
        actions={
          <Button
            data-testid="email-check-domain"
            variant="secondary"
            loading={dnsLoading}
            onClick={() => void checkDomain()}
          >
            Check domain
          </Button>
        }
      >
        {!dns ? (
          <p className="t-meta text-muted">
            Run a check to see what is published for the MAIL_FROM domain. DNS failures are reported
            here, never as a page error.
          </p>
        ) : (
          <div data-testid="email-dns">
            {dns.error && <p className="mb-2 text-sm text-danger-text">{dns.error}</p>}
            <DnsRow
              label="SPF"
              row={dns.spf}
              detail={
                dns.spf.purelymail ? 'Purelymail is mentioned.' : 'Purelymail is not mentioned.'
              }
            />
            <DnsRow
              label="DMARC"
              row={dns.dmarc}
              detail={dns.dmarc.policy ? `Policy: ${dns.dmarc.policy}` : undefined}
            />
            <DnsRow label="MX" row={dns.mx} />
            <DnsRow label="DKIM" row={dns.dkim} />
          </div>
        )}
      </SettingsSection>

      <div className="mb-1 mt-6 flex h-8 items-center justify-between border-b border-line">
        <h2 className="t-section text-ink">Recent sends</h2>
        <span className="t-meta text-muted">{log.data?.entries.length ?? 0}</span>
      </div>
      <div className="border-b border-line">
        {log.data?.entries.map((entry) => (
          <div
            key={entry.id}
            data-testid="email-log-row"
            className="flex items-center gap-3 border-b border-line px-2 py-2 last:border-b-0 hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{entry.subject}</span>
              <span className="block truncate t-meta text-muted">
                {entry.to} · {entry.kind}
              </span>
            </span>
            <span
              className={`rounded-full px-2 py-0.5 t-meta font-semibold ${TONES[entry.status]}`}
            >
              {entry.status}
            </span>
            <span className="w-20 shrink-0 text-right t-meta text-muted">
              {relative(entry.sentAt ?? entry.createdAt)}
            </span>
          </div>
        ))}
        {log.data?.entries.length === 0 && (
          <p className="px-2 py-5 text-center text-sm text-muted">No emails yet.</p>
        )}
      </div>
    </div>
  );
}
