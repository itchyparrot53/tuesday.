import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { api } from '../lib/api';
import { useMe } from '../hooks/useMe';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { Dialog } from '../components/ui/Dialog';
import { Avatar } from '../components/ui/Avatar';
import { PageHeader } from '../components/ui/PageHeader';
import { UnderlineTabs } from '../components/ui/Tabs';
import { Select } from '../components/ui/Select';
import type { AuthState } from '../App';
import type { NotificationPrefs } from '../../../shared/types';
import type { MyAiUsage } from '../../../shared/ai';
import { ColorThemeSwatches } from '../components/preferences/ColorThemeSwatches';
import { SettingsSection } from '../components/settings/SettingsSection';
import { applyPrefs } from '../lib/prefs';
import { relative } from '../lib/format';
import type { DensityPreference, ThemePreference } from '../../../shared/types';
import type { ColorThemeId } from '../../../shared/themes';

const optionClass = (selected: boolean) =>
  selected
    ? 'rounded-control border border-accent bg-accent-soft px-2.5 py-1 text-sm font-semibold text-accent-soft-ink'
    : 'rounded-control border border-line px-2.5 py-1 text-sm text-muted hover:text-ink';

export function ProfilePage() {
  const me = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const aiUsage = useQuery({
    queryKey: ['me', 'ai-usage'],
    queryFn: () => api<MyAiUsage>('GET', '/me/ai-usage'),
  });
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'profile';

  useEffect(() => {
    if (me.data) {
      setName(me.data.user.name);
      setTitle(me.data.user.title);
    }
  }, [me.data?.user.name, me.data?.user.title]);

  async function save() {
    setSaving(true);
    try {
      await api('PATCH', '/me', { name, title });
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.show('Profile saved', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    setSaving(true);
    try {
      await api('PATCH', '/me', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      toast.show('Password changed', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!me.data) return null;
  const user = me.data.user;
  const prefs = user.preferences;
  async function updatePrefs(patch: {
    theme?: ThemePreference;
    density?: DensityPreference;
    colorTheme?: ColorThemeId;
  }) {
    const next = { ...prefs, ...patch };
    applyPrefs(next);
    await api('PATCH', '/me', { preferences: patch });
    await qc.invalidateQueries({ queryKey: ['me'] });
  }
  const themeOptions: { id: ThemePreference; label: string }[] = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];
  const densityOptions: { id: DensityPreference; label: string }[] = [
    { id: 'comfortable', label: 'Comfortable' },
    { id: 'compact', label: 'Compact' },
  ];

  return (
    <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
      <PageHeader
        title="Profile"
        description={`${user.email} · ${user.role}`}
        tabs={
          <UnderlineTabs
            value={tab}
            onChange={(value) => setParams({ tab: value })}
            tabs={[
              { id: 'profile', label: 'Profile' },
              { id: 'notifications', label: 'Notifications' },
              { id: 'security', label: 'Security' },
            ]}
          />
        }
      />

      <div data-testid="my-ai-usage" className="mb-3 t-meta text-muted">
        You've used ${(aiUsage.data?.monthCostUsd ?? 0).toFixed(2)}
        {aiUsage.data?.limitUsd ? ` of $${aiUsage.data.limitUsd.toFixed(2)}` : ''} this month
      </div>
      <div className="mb-2 flex items-center gap-3">
        <Avatar name={user.name} color={user.color} size={40} />
        <div>
          <p className="font-semibold text-ink">{user.name}</p>
          <p className="t-meta text-muted">{user.title || 'No title yet'}</p>
        </div>
      </div>

      {tab === 'profile' && (
        <>
          <SettingsSection
            title="Your details"
            description="How your name appears across Tuesday."
            actions={
              <Button loading={saving} onClick={save}>
                Save changes
              </Button>
            }
          >
            <label htmlFor="profile-name" className="t-label mb-1 block text-ink">
              Name
            </label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-3"
            />
            <label htmlFor="profile-title" className="t-label mb-1 block text-ink">
              Title
            </label>
            <Input
              id="profile-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Product designer"
            />
          </SettingsSection>

          <SettingsSection
            title="Appearance"
            description="Mode, density and the accent colour used for your account."
          >
            <p className="t-label mb-1.5 text-ink">Mode</p>
            <div className="flex flex-wrap gap-1">
              {themeOptions.map((option) => (
                <button
                  key={option.id}
                  data-testid={`appearance-theme-${option.id}`}
                  onClick={() => updatePrefs({ theme: option.id })}
                  className={optionClass(prefs.theme === option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="t-label mb-1.5 mt-4 text-ink">Density</p>
            <div className="flex flex-wrap gap-1">
              {densityOptions.map((option) => (
                <button
                  key={option.id}
                  data-testid={`appearance-density-${option.id}`}
                  onClick={() => updatePrefs({ density: option.id })}
                  className={optionClass(prefs.density === option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="t-label mb-1.5 mt-4 text-ink">Colour theme</p>
            <ColorThemeSwatches
              value={prefs.colorTheme}
              onChange={(colorTheme, theme) => updatePrefs({ colorTheme, theme })}
            />
          </SettingsSection>

          <TokensCard />
        </>
      )}

      {tab === 'notifications' && (
        <>
          <NotifyPrefsCard />
          <PushSettingsCard />
        </>
      )}

      {tab === 'security' && (
        <>
          {user.sso ? (
            <SettingsSection title="Password" description="You sign in with SSO.">
              <p className="text-sm text-muted">
                This account uses single sign-on, so there is no password to change.
              </p>
            </SettingsSection>
          ) : (
            <SettingsSection
              title="Change password"
              description="Use at least 8 characters."
              actions={
                <Button
                  loading={saving}
                  disabled={!currentPassword || newPassword.length < 8}
                  onClick={changePassword}
                >
                  Change password
                </Button>
              }
            >
              <label htmlFor="current-password" className="t-label mb-1 block text-ink">
                Current password
              </label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mb-3"
              />
              <label htmlFor="new-password" className="t-label mb-1 block text-ink">
                New password
              </label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
              />
            </SettingsSection>
          )}
          <SessionsCard />
        </>
      )}
    </div>
  );
}

function TokensCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'write'>('read');
  const [secret, setSecret] = useState<string | null>(null);
  const tokens = useQuery({
    queryKey: ['tokens'],
    queryFn: async () =>
      (await api<{ tokens: import('../../../shared/types').ApiToken[] }>('GET', '/me/tokens'))
        .tokens,
  });

  return (
    <SettingsSection
      title="API tokens"
      description="Read or write access for scripts and integrations."
      actions={
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Create token
        </Button>
      }
    >
      <div className="border-y border-line">
        <div className="sticky top-0 z-10 grid h-9 grid-cols-[minmax(0,1fr)_70px_60px] items-center gap-3 border-b border-line bg-surface-2 px-2 md:grid-cols-[minmax(0,1fr)_140px_90px_70px]">
          <span className="t-label text-muted">Name</span>
          <span className="t-label hidden text-muted md:inline">Token</span>
          <span className="t-label text-muted">Scope</span>
          <span className="t-label text-right text-muted">Action</span>
        </div>
        {(tokens.data ?? []).map((token) => (
          <div
            key={token.id}
            className="grid h-[var(--row-h)] grid-cols-[minmax(0,1fr)_70px_60px] items-center gap-3 border-b border-line px-2 last:border-b-0 md:grid-cols-[minmax(0,1fr)_140px_90px_70px]"
          >
            <span className="truncate text-ink">{token.name}</span>
            <span className="t-meta hidden truncate text-muted md:inline">tue_{token.prefix}…</span>
            <span className="t-meta text-muted">{token.scope}</span>
            <button
              className="text-right text-sm text-danger hover:underline"
              onClick={async () => {
                await api('DELETE', `/me/tokens/${token.id}`);
                await qc.invalidateQueries({ queryKey: ['tokens'] });
              }}
            >
              Revoke
            </button>
          </div>
        ))}
        {tokens.data?.length === 0 && <p className="px-2 py-4 t-meta text-muted">No tokens yet.</p>}
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Create API token"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim()}
              onClick={async () => {
                try {
                  const result = await api<{ secret: string }>('POST', '/me/tokens', {
                    name,
                    scope,
                  });
                  setSecret(result.secret);
                  setName('');
                  await qc.invalidateQueries({ queryKey: ['tokens'] });
                } catch (err) {
                  toast.show((err as Error).message, 'error');
                }
              }}
            >
              Create token
            </Button>
          </>
        }
      >
        <label htmlFor="token-name" className="t-label mb-1 block text-ink">
          Name
        </label>
        <Input
          id="token-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mb-3"
        />
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-1">
            <input type="radio" checked={scope === 'read'} onChange={() => setScope('read')} />
            Read
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={scope === 'write'} onChange={() => setScope('write')} />
            Write
          </label>
        </div>
        {secret && (
          <div className="mt-3 rounded-control border border-line bg-canvas p-2">
            <p className="t-meta mb-1 font-medium text-ink">
              Copy this secret now — you won't see it again.
            </p>
            <code className="break-all t-meta text-ink">{secret}</code>
          </div>
        )}
      </Dialog>
    </SettingsSection>
  );
}

function NotifyPrefsCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const prefs = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => api<NotificationPrefs>('GET', '/me/notification-prefs'),
  });
  const state = useQuery({
    queryKey: ['auth', 'state'],
    queryFn: () => api<AuthState>('GET', '/auth/state'),
  });

  async function save(patch: {
    email?: Partial<NotificationPrefs['email']>;
    digest?: Partial<NotificationPrefs['digest']>;
  }) {
    const next = {
      email: { ...(prefs.data?.email ?? {}), ...(patch.email ?? {}) },
      digest: { ...(prefs.data?.digest ?? {}), ...(patch.digest ?? {}) },
    } as NotificationPrefs;
    qc.setQueryData(['notification-prefs'], next);
    try {
      const saved = await api<NotificationPrefs>('PUT', '/me/notification-prefs', patch);
      qc.setQueryData(['notification-prefs'], saved);
    } catch (error) {
      toast.show((error as Error).message, 'error');
      await qc.invalidateQueries({ queryKey: ['notification-prefs'] });
    }
  }

  const rows: { kind: keyof NotificationPrefs['email']; label: string; instant: boolean }[] = [
    { kind: 'mention', label: 'Mentions', instant: true },
    { kind: 'assigned', label: 'Assigned to me', instant: true },
    { kind: 'update_on_item', label: 'Updates on my items', instant: false },
    { kind: 'automation', label: 'Automation updates', instant: false },
  ];

  return (
    <div data-testid="notify-prefs">
      <SettingsSection title="Email notifications" description="Choose how each kind reaches you.">
        {state.data && !state.data.mail && (
          <p className="mb-3 rounded-control bg-sunken px-3 py-2 t-meta text-muted">
            Email isn't set up on this Tuesday — you'll only get in-app notifications.
          </p>
        )}
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.kind}
              className="flex flex-wrap items-center gap-3 border-b border-line py-2 last:border-b-0"
            >
              <span className="min-w-0 flex-1 text-sm text-ink">{row.label}</span>
              {(['instant', 'digest', 'off'] as const).map((value) => (
                <button
                  key={value}
                  data-testid="notify-pref"
                  data-kind={row.kind}
                  data-value={value}
                  disabled={value === 'instant' && !row.instant}
                  aria-pressed={prefs.data?.email[row.kind] === value}
                  className={`rounded-control border px-2 py-0.5 t-meta ${
                    prefs.data?.email[row.kind] === value
                      ? 'border-accent bg-accent-soft text-accent-soft-ink'
                      : 'border-line text-muted hover:text-ink disabled:opacity-40'
                  }`}
                  onClick={() => void save({ email: { [row.kind]: value } as never })}
                >
                  {value === 'instant' ? 'Instant' : value === 'digest' ? 'Daily digest' : 'Off'}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={prefs.data?.digest.enabled ?? true}
              onChange={(event) => void save({ digest: { enabled: event.target.checked } })}
            />
            Daily digest
          </label>
          <span className="flex items-center gap-2 text-sm text-ink">
            Send at
            <Select
              ariaLabel="Digest hour"
              value={String(prefs.data?.digest.hour ?? 8)}
              onChange={(value) => void save({ digest: { hour: Number(value) } })}
              options={Array.from({ length: 24 }, (_, hour) => ({
                value: String(hour),
                label: `${hour}:00`,
              }))}
              size="sm"
              className="w-[96px]"
            />
          </span>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={prefs.data?.digest.weekdaysOnly ?? true}
              onChange={(event) => void save({ digest: { weekdaysOnly: event.target.checked } })}
            />
            Weekdays only
          </label>
        </div>
      </SettingsSection>
    </div>
  );
}

function deviceLabel(agent: string): string {
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /Chrome\//.test(agent)
      ? 'Chrome'
      : /Firefox\//.test(agent)
        ? 'Firefox'
        : /Safari\//.test(agent)
          ? 'Safari'
          : 'Browser';
  const system = /Mac OS X/.test(agent)
    ? 'macOS'
    : /Windows/.test(agent)
      ? 'Windows'
      : /Android/.test(agent)
        ? 'Android'
        : /iPhone|iPad/.test(agent)
          ? 'iOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : 'Device';
  return `${browser} on ${system}`;
}

function SessionsCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: () =>
      api<{ sessions: import('../../../shared/types').SessionInfo[] }>('GET', '/me/sessions'),
  });

  return (
    <SettingsSection
      title="Sessions"
      description="Where you're signed in. Signing out others keeps this one."
      actions={
        <Button
          data-testid="sessions-revoke"
          variant="secondary"
          onClick={async () => {
            if (!window.confirm('Sign out all other sessions?')) return;
            await api('DELETE', '/me/sessions/others');
            await qc.invalidateQueries({ queryKey: ['sessions'] });
            toast.show('Other sessions signed out', 'success');
          }}
        >
          Sign out other sessions
        </Button>
      }
    >
      <div data-testid="sessions-list" className="space-y-2">
        {(sessions.data?.sessions ?? []).map((session) => (
          <div
            key={session.id}
            className="flex items-center gap-3 border-b border-line py-2 last:border-b-0"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 truncate text-sm text-ink">
                {deviceLabel(session.userAgent)}
                {session.current && (
                  <span className="rounded-full bg-accent-soft px-1.5 py-0.5 t-meta text-accent-soft-ink">
                    This device
                  </span>
                )}
              </span>
              <span className="block truncate t-meta text-muted">
                {session.ip || 'Unknown IP'} · {relative(session.lastSeenAt ?? session.createdAt)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

function PushSettingsCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;
  const prefs = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => api<NotificationPrefs>('GET', '/me/notification-prefs'),
  });

  useEffect(() => {
    if (!supported) return;
    setPermission(Notification.permission);
    void navigator.serviceWorker.ready.then(async (registration) => {
      const subscription = await registration.pushManager.getSubscription();
      setSubscribed(Boolean(subscription));
    });
  }, [supported]);

  async function turnOn() {
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return;
      const key = await api<{ publicKey: string }>('GET', '/push/key');
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key.publicKey) as BufferSource,
      });
      await api('POST', '/push/subscriptions', subscription.toJSON());
      setSubscribed(true);
      toast.show('Push notifications are on', 'success');
    } catch (error) {
      toast.show((error as Error).message, 'error');
    }
  }

  async function turnOff() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await api('DELETE', '/push/subscriptions', { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    setSubscribed(false);
  }

  const status = !supported
    ? 'Not supported'
    : permission === 'denied'
      ? 'Blocked in browser settings'
      : subscribed
        ? 'On'
        : 'Off';

  return (
    <SettingsSection
      title="Push notifications"
      description="Get mentions and assignments on this device, even when Tuesday is closed."
    >
      <div data-testid="push-settings" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sunken px-2 py-0.5 t-meta font-semibold text-muted">
            {status}
          </span>
          {!subscribed ? (
            <Button data-testid="push-on" size="sm" onClick={() => void turnOn()}>
              Turn on
            </Button>
          ) : (
            <>
              <Button
                data-testid="push-off"
                size="sm"
                variant="secondary"
                onClick={() => void turnOff()}
              >
                Turn off
              </Button>
              <Button
                data-testid="push-test"
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await api('POST', '/push/test');
                  toast.show('Test notification sent', 'success');
                }}
              >
                Send test
              </Button>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['mention', 'Mentions'],
              ['assigned', 'Assigned to me'],
              ['update_on_item', 'Updates on my items'],
              ['automation', 'Automations'],
              ['ai_budget', 'AI budget alerts'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              data-testid="push-pref"
              data-kind={kind}
              aria-pressed={prefs.data?.push[kind] ?? false}
              className={`rounded-control border px-2 py-0.5 t-meta ${
                prefs.data?.push[kind]
                  ? 'border-accent bg-accent-soft text-accent-soft-ink'
                  : 'border-line text-muted'
              }`}
              onClick={async () => {
                const next = !(prefs.data?.push[kind] ?? false);
                await api('PUT', '/me/notification-prefs', { push: { [kind]: next } });
                await qc.invalidateQueries({ queryKey: ['notification-prefs'] });
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {/iPad|iPhone|iPod/.test(navigator.userAgent) && (
          <p className="t-meta text-muted">
            On iPhone and iPad, install Tuesday to your Home Screen first, then turn on
            notifications here.
          </p>
        )}
      </div>
    </SettingsSection>
  );
}
