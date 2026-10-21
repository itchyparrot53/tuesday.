import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { AuthShell, Field } from './AuthShell';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { ColorThemeSwatches } from '../components/preferences/ColorThemeSwatches';
import { Avatar } from '../components/ui/Avatar';
import type { ColorThemeId } from '../../../shared/themes';
import type { InviteInfo } from '../../../shared/types';
import type { AuthState } from '../App';

export function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<InviteInfo>('GET', `/invites/${token}`),
    retry: false,
  });
  const state = useQuery({
    queryKey: ['auth', 'state'],
    queryFn: () => api<AuthState>('GET', '/auth/state'),
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [colorTheme, setColorTheme] = useState<ColorThemeId>('monday');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (invite.isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center text-muted">
        <Spinner size={20} />
      </div>
    );
  }

  if (invite.error) {
    const gone = invite.error instanceof ApiError && invite.error.status === 410;
    return (
      <AuthShell title={gone ? 'Invite unavailable' : 'Invite not found'}>
        <p className="text-sm text-muted">
          {gone
            ? 'This invite has expired or was already used.'
            : 'This invite link is not valid. Ask an admin for a new one.'}
        </p>
      </AuthShell>
    );
  }

  const info = invite.data!;
  const lockedEmail = info.email;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api('POST', '/auth/accept-invite', {
        token,
        name,
        email: lockedEmail ?? email,
        password,
        colorTheme,
        theme,
      });
      await qc.invalidateQueries({ queryKey: ['me'] });
      await qc.invalidateQueries({ queryKey: ['auth', 'state'] });
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell title="Join Tuesday" subtitle={`Join ${info.orgName} on Tuesday.`}>
      <div
        data-testid="invite-who"
        className="mb-5 rounded-[12px] border border-line bg-surface-2 p-3"
      >
        <div className="flex items-center gap-2">
          {info.invitedBy && (
            <Avatar name={info.invitedBy.name} color={info.invitedBy.color} size={32} />
          )}
          <p className="text-sm text-ink">
            {info.invitedBy ? (
              <>
                <strong>{info.invitedBy.name}</strong> invited you to join{' '}
                <strong>{info.orgName}</strong> on Tuesday
              </>
            ) : (
              <>
                You're invited to join <strong>{info.orgName}</strong> on Tuesday
              </>
            )}
          </p>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="flex -space-x-1">
            {info.members.slice(0, 5).map((member) => (
              <Avatar key={member.name} name={member.name} color={member.color} size={24} />
            ))}
          </span>
          <span className="t-meta text-muted">{info.memberCount} people are already here</span>
        </div>
        {info.boardNames?.length > 0 && (
          <p className="mt-2 text-sm text-ink">
            You'll have access to: {info.boardNames.join(', ')}
          </p>
        )}
        <p className="mt-2 t-meta text-muted">
          {info.role === 'admin'
            ? 'You can manage members and settings.'
            : info.role === 'viewer'
              ? 'You can view boards and comment.'
              : 'You can create and edit boards.'}
        </p>
      </div>
      {state.data?.sso.enabled && (
        <a
          href={`/api/auth/oidc/start?invite=${encodeURIComponent(token)}`}
          className="mb-4 flex h-9 w-full items-center justify-center rounded-[8px] border border-line-strong bg-surface text-sm font-semibold text-ink hover:bg-sunken"
        >
          Join with SSO
        </a>
      )}
      <form onSubmit={submit}>
        <Field label="Your name" htmlFor="name">
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            value={lockedEmail ?? email}
            onChange={(e) => setEmail(e.target.value)}
            readOnly={Boolean(lockedEmail)}
            required
          />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters.">
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>
        <div className="mb-4">
          <p className="t-label mb-1.5 text-ink">Colour theme</p>
          <ColorThemeSwatches
            value={colorTheme}
            onChange={(next, mode) => {
              setColorTheme(next);
              setTheme(mode);
            }}
            compact
          />
        </div>
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <Button type="submit" loading={saving} className="w-full">
          Join {info.orgName}
        </Button>
      </form>
    </AuthShell>
  );
}
