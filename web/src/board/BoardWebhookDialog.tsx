import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCw, Trash2, Webhook } from 'lucide-react';
import { api } from '../lib/api';
import { relative } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Dialog, Drawer } from '../components/ui/Dialog';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';

interface Delivery {
  id: number;
  createdAt: string;
  statusCode: number;
  itemId: number | null;
  ignored: string[];
  errors: { field: string; message: string }[];
  body: string;
  ip: string | null;
}

interface InboundWebhook {
  id: number;
  token: string;
  url: string;
  createdAt: string;
  lastUsedAt: string | null;
  secretSet: boolean;
}

export function BoardWebhookDialog({
  boardId,
  open,
  onOpenChange,
}: {
  boardId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [secretBusy, setSecretBusy] = useState(false);
  const [secretInput, setSecretInput] = useState('');
  const [viewDelivery, setViewDelivery] = useState<Delivery | null>(null);
  const hook = useQuery({
    queryKey: ['inbound-webhook', boardId],
    queryFn: async () =>
      (await api<{ webhook: InboundWebhook | null }>('GET', `/boards/${boardId}/inbound-webhook`))
        .webhook,
    enabled: open,
  });
  const deliveries = useQuery({
    queryKey: ['inbound-webhook-deliveries', boardId],
    queryFn: async () =>
      (
        await api<{ deliveries: Delivery[] }>(
          'GET',
          `/boards/${boardId}/inbound-webhook/deliveries`,
        )
      ).deliveries,
    enabled: open && Boolean(hook.data),
  });

  async function rotate() {
    setBusy(true);
    try {
      await api('POST', `/boards/${boardId}/inbound-webhook`);
      await qc.invalidateQueries({ queryKey: ['inbound-webhook', boardId] });
      await qc.invalidateQueries({ queryKey: ['inbound-webhook-deliveries', boardId] });
      toast.show(hook.data ? 'Webhook token rotated' : 'Webhook created', 'success');
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!window.confirm('Disable this webhook? The current URL will stop working.')) return;
    setBusy(true);
    try {
      await api('DELETE', `/boards/${boardId}/inbound-webhook`);
      await qc.invalidateQueries({ queryKey: ['inbound-webhook', boardId] });
      await qc.invalidateQueries({ queryKey: ['inbound-webhook-deliveries', boardId] });
      toast.show('Webhook disabled', 'success');
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      await api('POST', `/boards/${boardId}/inbound-webhook/test`);
      await qc.invalidateQueries({ queryKey: ['inbound-webhook-deliveries', boardId] });
      toast.show('Test item created', 'success');
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveSecret() {
    if (secretInput.trim().length < 16) {
      toast.show('Use a signing secret of at least 16 characters', 'error');
      return;
    }
    setSecretBusy(true);
    try {
      await api('PATCH', `/boards/${boardId}/inbound-webhook`, { secret: secretInput });
      setSecretInput('');
      await qc.invalidateQueries({ queryKey: ['inbound-webhook', boardId] });
      toast.show('Signing secret saved', 'success');
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setSecretBusy(false);
    }
  }

  async function removeSecret() {
    if (!window.confirm('Remove the signing secret? Unsigned requests will be accepted again.')) {
      return;
    }
    setSecretBusy(true);
    try {
      await api('PATCH', `/boards/${boardId}/inbound-webhook`, { secret: null });
      await qc.invalidateQueries({ queryKey: ['inbound-webhook', boardId] });
      toast.show('Signing secret removed', 'success');
    } catch (error) {
      toast.show((error as Error).message, 'error');
    } finally {
      setSecretBusy(false);
    }
  }

  async function copy() {
    if (!hook.data) return;
    try {
      await navigator.clipboard.writeText(hook.data.url);
      toast.show('Webhook URL copied', 'success');
    } catch {
      toast.show('Could not copy the URL', 'error');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Inbound webhook"
      description="Create items from any service that can send a JSON POST. Useful for forms, automations and client intake."
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      }
    >
      {hook.isLoading && <p className="text-sm text-muted">Loading webhook…</p>}
      {hook.isError && (
        <p className="text-sm text-danger">Only board managers can manage an inbound webhook.</p>
      )}
      {!hook.isLoading && !hook.isError && !hook.data && (
        <div className="rounded-control border border-line bg-surface-2 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent-soft-ink">
            <Webhook size={17} />
          </span>
          <p className="mt-3 text-sm font-semibold text-ink">No webhook yet</p>
          <p className="mt-1 text-sm text-muted">
            Create a URL, then POST <code className="t-meta">{'{"name":"New item"}'}</code> to it
            from Zapier, a form, or your own script.
          </p>
          <Button variant="subtle" className="mt-3" loading={busy} onClick={() => void rotate()}>
            Create webhook
          </Button>
        </div>
      )}
      {hook.data && (
        <div>
          <label htmlFor="inbound-webhook-url" className="t-label mb-1 block text-ink">
            URL
          </label>
          <div className="flex gap-1.5">
            <Input
              id="inbound-webhook-url"
              readOnly
              value={hook.data.url}
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 font-mono"
            />
            <Button variant="secondary" icon={<Copy size={13} />} onClick={() => void copy()}>
              Copy
            </Button>
          </div>
          <p className="mt-2 t-meta text-muted">
            {hook.data.lastUsedAt
              ? `Last used ${relative(hook.data.lastUsedAt)}.`
              : 'Not used yet. Only POST requests with this URL can create an item.'}
          </p>

          <div className="mt-4 rounded-control border border-line bg-canvas p-3">
            <p className="t-label text-ink">Example</p>
            <pre className="mt-1 whitespace-pre-wrap break-all t-meta text-muted">
              {`curl -X POST "${hook.data.url}" \\\n  -H "content-type: application/json" \\\n  -d '{"name":"New item","group":"To do"}'`}
            </pre>
            <p className="mt-2 t-meta text-muted">
              Accepts <code>name</code> (or <code>title</code>/<code>subject</code>), and optional{' '}
              <code>group</code> or <code>groupId</code>. Without a group it uses the first group.
            </p>
          </div>

          <div className="mt-4 rounded-control border border-line bg-surface-2 p-3">
            <p className="t-label text-ink">
              Signing secret {hook.data.secretSet ? '· configured' : '· optional'}
            </p>
            <p className="mt-1 t-meta text-muted">
              When set, every request must send{' '}
              <code>X-Tuesday-Signature: sha256=&lt;HMAC-SHA256(raw body, secret)&gt;</code>.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Input
                data-testid="webhook-secret"
                aria-label="Signing secret"
                type="password"
                autoComplete="new-password"
                value={secretInput}
                onChange={(event) => setSecretInput(event.target.value)}
                placeholder={hook.data.secretSet ? 'Replace secret' : 'At least 16 characters'}
                className="min-w-0 flex-1"
              />
              <Button variant="secondary" loading={secretBusy} onClick={() => void saveSecret()}>
                {hook.data.secretSet ? 'Replace' : 'Set secret'}
              </Button>
              {hook.data.secretSet && (
                <Button
                  variant="ghost"
                  className="!text-danger-text hover:!bg-danger-soft"
                  disabled={secretBusy}
                  onClick={() => void removeSecret()}
                >
                  Remove
                </Button>
              )}
            </div>
            {hook.data.secretSet && (
              <pre className="mt-2 whitespace-pre-wrap break-all t-meta text-muted">
                {`BODY='{"name":"Signed item"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -X POST "${hook.data.url}" \
  -H "content-type: application/json" \
  -H "X-Tuesday-Signature: sha256=$SIG" \
  -d "$BODY"`}
              </pre>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              data-testid="webhook-test"
              variant="secondary"
              icon={<Webhook size={13} />}
              loading={busy}
              onClick={() => void sendTest()}
            >
              Send test item
            </Button>
            <Button
              variant="secondary"
              icon={<RefreshCw size={13} />}
              loading={busy}
              onClick={() => void rotate()}
            >
              Rotate token
            </Button>
            <Button
              variant="ghost"
              className="!text-danger-text hover:!bg-danger-soft"
              icon={<Trash2 size={13} />}
              disabled={busy}
              onClick={() => void disable()}
            >
              Disable
            </Button>
          </div>
          <p className="mt-2 t-meta text-muted">
            Rotating replaces the URL immediately. Anything still posting to the old URL will fail.
          </p>

          <div className="mt-5" data-testid="webhook-deliveries">
            <div className="flex items-center justify-between border-b border-line pb-1">
              <p className="t-label text-ink">Recent deliveries</p>
              <span className="t-meta text-muted">{deliveries.data?.length ?? 0}</span>
            </div>
            {deliveries.isLoading && <p className="py-2 t-meta text-muted">Loading deliveries…</p>}
            {deliveries.data?.length === 0 && (
              <p className="py-2 t-meta text-muted">No deliveries yet.</p>
            )}
            {deliveries.data?.map((delivery) => (
              <div
                key={delivery.id}
                data-testid="webhook-delivery-row"
                className="flex flex-wrap items-center gap-2 border-b border-line py-2 last:border-b-0"
              >
                <span
                  className={`rounded-full px-2 py-0.5 t-meta font-semibold ${
                    delivery.statusCode >= 200 && delivery.statusCode < 300
                      ? 'bg-success-soft text-success'
                      : 'bg-danger-soft text-danger-text'
                  }`}
                >
                  {delivery.statusCode}
                </span>
                <span className="t-meta text-muted">
                  {delivery.itemId ? `Item #${delivery.itemId}` : 'No item'}
                </span>
                <span className="min-w-0 flex-1 truncate t-meta text-muted">
                  {delivery.errors.length
                    ? `${delivery.errors.length} error(s)`
                    : delivery.ignored.length
                      ? `${delivery.ignored.length} ignored`
                      : 'OK'}
                </span>
                <span className="t-meta text-muted">{relative(delivery.createdAt)}</span>
                <Button size="sm" variant="secondary" onClick={() => setViewDelivery(delivery)}>
                  View
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Drawer
        open={Boolean(viewDelivery)}
        onOpenChange={(next) => {
          if (!next) setViewDelivery(null);
        }}
        title="Webhook delivery"
        closeLabel="Close delivery"
      >
        {viewDelivery && (
          <div className="space-y-3 text-sm" data-testid="webhook-delivery-detail">
            <p className="t-meta text-muted">
              {new Date(viewDelivery.createdAt).toLocaleString()} · HTTP {viewDelivery.statusCode}
              {viewDelivery.ip ? ` · ${viewDelivery.ip}` : ''}
            </p>
            {viewDelivery.errors.length > 0 && (
              <div>
                <p className="t-label text-ink">Errors</p>
                {viewDelivery.errors.map((error, index) => (
                  <p key={index} className="t-meta text-danger-text">
                    {error.field}: {error.message}
                  </p>
                ))}
              </div>
            )}
            {viewDelivery.ignored.length > 0 && (
              <div>
                <p className="t-label text-ink">Ignored</p>
                <p className="t-meta text-muted">{viewDelivery.ignored.join(', ')}</p>
              </div>
            )}
            <div>
              <p className="t-label text-ink">Request body</p>
              <pre className="mt-1 whitespace-pre-wrap break-all rounded-control border border-line bg-canvas p-2 t-meta text-ink">
                {viewDelivery.body}
              </pre>
            </div>
            {viewDelivery.itemId && (
              <p className="t-meta text-muted">Created item #{viewDelivery.itemId}</p>
            )}
          </div>
        )}
      </Drawer>
    </Dialog>
  );
}
