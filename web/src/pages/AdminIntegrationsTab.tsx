import { useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { relative } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { SettingsSection } from '../components/settings/SettingsSection';
import type { Webhook, WebhookDelivery, WebhookEvent } from '../../../shared/types';

const EVENTS: WebhookEvent[] = [
  'item.created',
  'item.updated',
  'item.moved',
  'item.archived',
  'update.posted',
];

export function AdminIntegrationsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>(['item.created']);
  const webhooks = useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => (await api<{ webhooks: Webhook[] }>('GET', '/webhooks')).webhooks,
  });
  const deliveryQueries = useQueries({
    queries: (webhooks.data ?? []).map((webhook) => ({
      queryKey: ['webhook-deliveries', webhook.id],
      queryFn: async () =>
        (await api<{ deliveries: WebhookDelivery[] }>('GET', `/webhooks/${webhook.id}/deliveries`))
          .deliveries,
    })),
  });
  const deliveries = deliveryQueries
    .flatMap((query, index) =>
      (query.data ?? []).map((delivery) => ({
        ...delivery,
        webhookUrl: webhooks.data?.[index]?.url ?? `Webhook ${delivery.webhookId}`,
      })),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);

  async function create() {
    try {
      const result = await api<{ secret: string }>('POST', '/webhooks', { url, events });
      await qc.invalidateQueries({ queryKey: ['webhooks'] });
      toast.show(`Webhook created. Secret: ${result.secret}`, 'success');
      setUrl('');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  return (
    <div>
      <SettingsSection
        title="Webhooks"
        description="Send board events to another service. Each delivery is signed with its secret."
        actions={
          <Button size="sm" disabled={!url.trim()} onClick={create}>
            Add webhook
          </Button>
        }
      >
        <label htmlFor="webhook-url" className="t-label mb-1 block text-ink">
          Endpoint URL
        </label>
        <Input
          id="webhook-url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/hooks/tuesday"
          className="mb-3"
        />
        <p className="t-label mb-1.5 text-ink">Events</p>
        <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2">
          {EVENTS.map((event) => (
            <label key={event} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={events.includes(event)}
                onChange={(change) =>
                  setEvents((current) =>
                    change.target.checked
                      ? [...current, event]
                      : current.filter((entry) => entry !== event),
                  )
                }
              />
              {event}
            </label>
          ))}
        </div>

        <div className="border-y border-line">
          <div className="sticky top-0 z-10 grid h-9 grid-cols-[minmax(0,1fr)_80px_100px] items-center gap-3 border-b border-line bg-surface-2 px-2 md:grid-cols-[minmax(0,1fr)_180px_90px_110px]">
            <span className="t-label text-muted">Endpoint</span>
            <span className="t-label hidden text-muted md:inline">Events</span>
            <span className="t-label text-muted">Status</span>
            <span className="t-label text-right text-muted">Actions</span>
          </div>
          {(webhooks.data ?? []).map((webhook) => (
            <div
              key={webhook.id}
              className="grid min-h-[var(--row-h)] grid-cols-[minmax(0,1fr)_80px_100px] items-center gap-3 border-b border-line px-2 py-1 last:border-b-0 md:grid-cols-[minmax(0,1fr)_180px_90px_110px]"
            >
              <span className="truncate text-ink">{webhook.url}</span>
              <span className="hidden truncate t-meta text-muted md:inline">
                {webhook.events.join(', ')}
              </span>
              <span
                className={
                  webhook.enabled
                    ? 'w-fit rounded-chip bg-success-soft px-1.5 py-0.5 t-meta font-semibold text-success'
                    : 'w-fit rounded-chip bg-warning-soft px-1.5 py-0.5 t-meta font-semibold text-warning'
                }
              >
                {webhook.enabled ? 'Enabled' : 'Disabled'}
              </span>
              <div className="flex justify-end gap-2">
                <button
                  className="text-sm text-accent hover:underline"
                  onClick={async () => {
                    const result = await api<{
                      delivery: { ok: boolean; error: string | null };
                    }>('POST', `/webhooks/${webhook.id}/test`);
                    toast.show(
                      result.delivery.ok ? 'Test delivered' : (result.delivery.error ?? 'Failed'),
                      result.delivery.ok ? 'success' : 'error',
                    );
                  }}
                >
                  Test
                </button>
                <button
                  className="text-sm text-danger hover:underline"
                  onClick={async () => {
                    await api('DELETE', `/webhooks/${webhook.id}`);
                    await qc.invalidateQueries({ queryKey: ['webhooks'] });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {webhooks.data?.length === 0 && (
            <p className="px-2 py-5 text-center text-sm text-muted">No webhooks yet.</p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Recent deliveries"
        description="The last 20 attempts across every webhook."
      >
        <div className="border-y border-line">
          <div className="sticky top-0 z-10 grid h-9 grid-cols-[minmax(0,1fr)_70px] items-center gap-3 border-b border-line bg-surface-2 px-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_70px_120px]">
            <span className="t-label text-muted">Event</span>
            <span className="t-label hidden text-muted md:inline">Endpoint</span>
            <span className="t-label hidden text-muted md:inline">Status</span>
            <span className="t-label text-right text-muted">When</span>
          </div>
          {deliveries.map((delivery) => (
            <div
              key={delivery.id}
              className="grid min-h-[var(--row-h)] grid-cols-[minmax(0,1fr)_70px] items-center gap-3 border-b border-line px-2 py-1 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_70px_120px] md:py-0"
            >
              <span className="truncate text-ink">{delivery.event}</span>
              <span className="hidden truncate t-meta text-muted md:inline">
                {delivery.webhookUrl}
              </span>
              <span
                className={
                  delivery.ok
                    ? 'hidden w-fit rounded-chip bg-success-soft px-1.5 py-0.5 t-meta font-semibold text-success md:inline'
                    : 'hidden w-fit rounded-chip bg-danger-soft px-1.5 py-0.5 t-meta font-semibold text-danger-text md:inline'
                }
              >
                {delivery.ok ? 'Delivered' : (delivery.statusCode ?? 'Failed')}
              </span>
              <span className="t-meta text-right text-muted">{relative(delivery.createdAt)}</span>
            </div>
          ))}
          {deliveries.length === 0 && (
            <p className="px-2 py-5 text-center text-sm text-muted">No deliveries yet.</p>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
