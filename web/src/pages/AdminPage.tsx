import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Mail, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useMe } from '../hooks/useMe';
import { useUsers } from '../hooks/useUsers';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Avatar } from '../components/ui/Avatar';
import { PageHeader } from '../components/ui/PageHeader';
import { QueryError } from '../components/ui/QueryError';
import { Spinner } from '../components/ui/Spinner';
import { UnderlineTabs } from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';
import { SettingsSection } from '../components/settings/SettingsSection';
import { Select } from '../components/ui/Select';
import type { Invite, Role, User } from '../../../shared/types';
import { AdminAiTab } from './AdminAiTab';
import { AdminIntegrationsTab } from './AdminIntegrationsTab';
import { AdminDataTab } from './AdminDataTab';
import { AdminEmailTab } from './AdminEmailTab';
import { AdminAuditTab } from './AdminAuditTab';
import { AdminGoLiveTab } from './AdminGoLiveTab';
import { AdminGuideTab } from './AdminGuideTab';

const tabs = [
  { id: 'members', label: 'Members' },
  { id: 'guide', label: 'Guide' },
  { id: 'invites', label: 'Invites' },
  { id: 'ai', label: 'AI' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'data', label: 'Data' },
  { id: 'email', label: 'Email' },
  { id: 'audit', label: 'Audit' },
  { id: 'go-live', label: 'Go-live' },
];

export function AdminPage() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'members';
  const isAdmin = me.data?.user.role === 'owner' || me.data?.user.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
        <PageHeader title="Admin" description="You do not have permission to view this page." />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-7 py-7 max-md:px-4">
      <PageHeader
        title="Admin"
        description="People, access and organisation settings."
        tabs={
          <UnderlineTabs value={tab} onChange={(value) => setParams({ tab: value })} tabs={tabs} />
        }
      />
      {tab === 'members' && <MembersTab />}
      {tab === 'guide' && <AdminGuideTab />}
      {tab === 'invites' && <InvitesTab />}
      {tab === 'ai' && <AdminAiTab />}
      {tab === 'integrations' && <AdminIntegrationsTab />}
      {tab === 'data' && <AdminDataTab />}
      {tab === 'email' && <AdminEmailTab />}
      {tab === 'audit' && <AdminAuditTab />}
      {tab === 'go-live' && <AdminGoLiveTab />}
    </div>
  );
}

function MembersTab() {
  const me = useMe();
  const users = useUsers();
  const qc = useQueryClient();
  const toast = useToast();
  const [orgName, setOrgName] = useState(me.data?.org.name ?? '');
  const [timezone, setTimezone] = useState(me.data?.org.timezone ?? 'UTC');
  const [peopleFilter, setPeopleFilter] = useState<'all' | 'people' | 'guests'>('all');
  const zones =
    (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.(
      'timeZone',
    ) ?? [];

  useEffect(() => {
    if (me.data?.org.name) setOrgName(me.data.org.name);
    if (me.data?.org.timezone) setTimezone(me.data.org.timezone);
  }, [me.data?.org.name, me.data?.org.timezone]);

  async function saveOrg() {
    try {
      await api('PATCH', '/org', { name: orgName, timezone });
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.show('Organisation updated', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  async function resetLink(user: User) {
    try {
      const data = await api<{ link: string }>('POST', `/users/${user.id}/reset-link`);
      await navigator.clipboard.writeText(data.link);
      toast.show('Reset link copied. It works for 60 minutes.', 'success');
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  async function patchUser(user: User, patch: { role?: Role; isActive?: boolean }) {
    try {
      await api('PATCH', `/users/${user.id}`, patch);
      await qc.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  return (
    <div>
      {users.isError && <QueryError onRetry={() => void users.refetch()} className="mb-4" />}
      <SettingsSection
        title="Organisation"
        description="The name and timezone used in notifications and backups."
        actions={<Button onClick={saveOrg}>Save changes</Button>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="org-name" className="t-label mb-1 block text-ink">
              Organisation name
            </label>
            <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="org-timezone" className="t-label mb-1 block text-ink">
              Timezone
            </label>
            <Input
              id="org-timezone"
              list="timezone-options"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
            <datalist id="timezone-options">
              <option value="UTC" />
              {zones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </div>
        </div>
      </SettingsSection>

      <div className="mb-1 mt-6 flex h-8 items-center justify-between border-b border-line">
        <h2 className="t-section text-ink">People</h2>
        <div className="flex items-center gap-2">
          <Select
            ariaLabel="Filter people"
            value={peopleFilter}
            onChange={(value) => setPeopleFilter(value as typeof peopleFilter)}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'people', label: 'Members' },
              { value: 'guests', label: 'Guests' },
            ]}
            size="sm"
            className="w-[120px]"
          />
          <span className="t-meta text-muted">{users.data?.users.length ?? 0}</span>
        </div>
      </div>
      {users.isLoading && (
        <div className="flex h-24 items-center justify-center text-muted">
          <Spinner size={16} />
        </div>
      )}
      <div className="border-b border-line">
        <div className="sticky top-0 z-10 grid h-9 grid-cols-[minmax(0,1fr)_100px_70px] items-center gap-3 border-b border-line bg-surface-2 px-2 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_160px_90px]">
          <span className="t-label text-muted">Person</span>
          <span className="hidden t-label text-muted md:block">Email</span>
          <span className="t-label text-muted">Role</span>
          <span className="t-label text-muted">Active</span>
        </div>
        {users.data?.users
          .filter((user) =>
            peopleFilter === 'all'
              ? true
              : peopleFilter === 'guests'
                ? user.isGuest
                : !user.isGuest,
          )
          .map((user) => (
            <div
              key={user.id}
              data-testid="admin-person-row"
              className="grid min-h-[var(--row-h)] grid-cols-[minmax(0,1fr)_100px_70px] items-center gap-3 border-b border-line px-2 py-1.5 last:border-b-0 hover:bg-surface-2 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_160px_90px]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Avatar name={user.name} color={user.color} size={24} />
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-ink">
                    {user.name}
                    {user.isGuest && (
                      <span data-testid="guest-badge">
                        <span className="rounded-full bg-sunken px-1.5 py-0.5 t-meta font-semibold text-muted">
                          Guest
                        </span>
                      </span>
                    )}
                    {!user.isActive && <span className="t-meta text-muted">(inactive)</span>}
                  </p>
                  <p className="truncate t-meta text-muted md:hidden">{user.email}</p>
                </div>
              </div>
              <div data-testid="admin-person-email" className="hidden min-w-0 md:block">
                <p className="truncate text-sm text-muted">{user.email}</p>
                {user.title && <p className="truncate t-meta text-muted">{user.title}</p>}
              </div>
              {user.role === 'owner' ? (
                <span className="text-sm text-muted">Owner</span>
              ) : (
                <Select
                  ariaLabel={`Role for ${user.name}`}
                  value={user.role}
                  onChange={(value) => patchUser(user, { role: value as Role })}
                  options={[
                    { value: 'admin', label: 'Admin' },
                    { value: 'member', label: 'Member' },
                    { value: 'viewer', label: 'Viewer' },
                  ]}
                  size="sm"
                  className="w-full"
                />
              )}
              {user.role === 'owner' ? (
                <span className="flex items-center gap-2 text-sm text-muted">
                  Yes
                  <button
                    data-testid="reset-link"
                    aria-label={`Create reset link for ${user.name}`}
                    className="rounded-control p-1 text-muted hover:bg-canvas hover:text-ink"
                    onClick={() => void resetLink(user)}
                  >
                    <KeyRound size={14} />
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={user.isActive}
                      onChange={(e) => patchUser(user, { isActive: e.target.checked })}
                    />
                    {user.isActive ? 'Yes' : 'No'}
                  </label>
                  <button
                    data-testid="reset-link"
                    aria-label={`Create reset link for ${user.name}`}
                    className="rounded-control p-1 text-muted hover:bg-canvas hover:text-ink"
                    onClick={() => void resetLink(user)}
                  >
                    <KeyRound size={14} />
                  </button>
                </span>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function InvitesTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member' | 'viewer'>('member');
  const [created, setCreated] = useState<Invite | null>(null);
  const [saving, setSaving] = useState(false);

  const invites = useQuery({
    queryKey: ['invites'],
    queryFn: async () => (await api<{ invites: Invite[] }>('GET', '/invites')).invites,
  });

  async function createInvite() {
    setSaving(true);
    try {
      const data = await api<{ invite: Invite }>('POST', '/invites', {
        ...(email.trim() ? { email } : {}),
        role,
      });
      setCreated(data.invite);
      setEmail('');
      await qc.invalidateQueries({ queryKey: ['invites'] });
    } catch (err) {
      toast.show((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function resend(invite: Invite) {
    try {
      await api('POST', `/invites/${invite.id}/resend`);
      toast.show('Invite email queued', 'success');
      await qc.invalidateQueries({ queryKey: ['invites'] });
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  async function revoke(invite: Invite) {
    try {
      await api('DELETE', `/invites/${invite.id}`);
      await qc.invalidateQueries({ queryKey: ['invites'] });
    } catch (err) {
      toast.show((err as Error).message, 'error');
    }
  }

  return (
    <div>
      <SettingsSection
        title="Create invite"
        description="Invite one person by email, or create a link anyone can use."
        actions={
          <Button loading={saving} icon={<Plus size={14} />} onClick={createInvite}>
            Create invite
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
          <div>
            <label htmlFor="invite-email" className="t-label mb-1 block text-ink">
              Email (optional)
            </label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
            />
          </div>
          <div>
            <span className="t-label mb-1 block text-ink">Role</span>
            <Select
              ariaLabel="Role"
              value={role}
              onChange={(value) => setRole(value as typeof role)}
              options={[
                { value: 'admin', label: 'Admin' },
                { value: 'member', label: 'Member' },
                { value: 'viewer', label: 'Viewer' },
              ]}
            />
          </div>
        </div>
        {created && (
          <div className="mt-4 rounded-control border border-line bg-surface p-3">
            <p className="t-label mb-1 text-ink">Invite link</p>
            <p data-testid="invite-status" className="mb-2 t-meta text-muted">
              {created.emailedAt
                ? `Emailed ${created.emailedAt.slice(0, 16).replace('T', ' ')}`
                : 'Link only'}
            </p>
            <div className="flex items-center gap-2">
              <code className="t-meta min-w-0 flex-1 truncate rounded-chip bg-canvas px-2 py-1.5 text-ink">
                {created.url}
              </code>
              <Button
                variant="secondary"
                size="sm"
                icon={<Copy size={13} />}
                onClick={() => {
                  navigator.clipboard.writeText(created.url);
                  toast.show('Invite link copied', 'success');
                }}
              >
                Copy
              </Button>
            </div>
          </div>
        )}
      </SettingsSection>

      <div className="mb-1 mt-6 flex h-8 items-center justify-between border-b border-line">
        <h2 className="t-section text-ink">Pending invites</h2>
        <span className="t-meta text-muted">{invites.data?.length ?? 0}</span>
      </div>
      <div className="border-b border-line">
        <div className="sticky top-0 z-10 grid h-9 grid-cols-[minmax(0,1fr)_70px_44px] items-center gap-3 border-b border-line bg-surface-2 px-2 md:grid-cols-[minmax(0,1fr)_100px_120px_70px_44px]">
          <span className="t-label text-muted">Person</span>
          <span className="t-label text-muted">Role</span>
          <span className="t-label hidden text-muted md:inline">Status</span>
          <span className="t-label hidden text-muted md:inline">Expires</span>
          <span className="t-label text-right text-muted">Action</span>
        </div>
        {invites.data?.length === 0 && (
          <p className="px-2 py-5 text-center text-sm text-muted">No pending invites.</p>
        )}
        {invites.data?.map((invite) => (
          <div
            key={invite.id}
            className="grid h-[var(--row-h)] grid-cols-[minmax(0,1fr)_70px_44px] items-center gap-3 border-b border-line px-2 last:border-b-0 hover:bg-surface-2 md:grid-cols-[minmax(0,1fr)_100px_120px_70px_44px]"
          >
            <span className="truncate text-ink">{invite.email ?? 'Anyone with the link'}</span>
            <span className="t-meta text-muted">{invite.role}</span>
            <span data-testid="invite-status" className="t-meta hidden text-muted md:inline">
              {invite.emailedAt ? 'Emailed' : 'Link only'}
            </span>
            <span className="t-meta hidden text-muted md:inline">
              {invite.expiresAt.slice(0, 10)}
            </span>
            <span className="ml-auto flex items-center">
              {invite.email && (
                <button
                  aria-label="Resend email"
                  title="Resend email"
                  onClick={() => resend(invite)}
                  className="rounded-control p-1 text-muted hover:bg-canvas hover:text-ink"
                >
                  <Mail size={15} />
                </button>
              )}
              <button
                aria-label="Revoke invite"
                onClick={() => revoke(invite)}
                className="rounded-control p-1 text-muted hover:bg-canvas hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
