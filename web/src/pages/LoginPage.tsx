import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { AuthState } from '../App';
import { useQuery } from '@tanstack/react-query';
import { useMe } from '../hooks/useMe';
import { AuthShell, Field } from './AuthShell';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function LoginPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const state = useQuery({
    queryKey: ['auth', 'state'],
    queryFn: () => api<AuthState>('GET', '/auth/state'),
  });
  const [params] = useSearchParams();
  const ssoError = params.get('error');
  const next = params.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const [ownerForm, setOwnerForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (me.data) return <Navigate to={target} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api('POST', '/auth/login', { email, password });
      await qc.invalidateQueries({ queryKey: ['me'] });
      await qc.invalidateQueries({ queryKey: ['auth', 'state'] });
      navigate(target);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  const ssoMessage =
    ssoError === 'sso_not_invited'
      ? "Your account isn't set up yet. Ask an admin for an invite."
      : ssoError === 'sso_email_unverified'
        ? "Your identity provider didn't confirm your email address."
        : ssoError
          ? 'Single sign-on failed. Try again or use your password.'
          : '';

  return (
    <AuthShell title="Sign in" subtitle="Welcome back.">
      {state.data?.sso.enabled && (
        <a
          data-testid="login-sso"
          href="/api/auth/oidc/start"
          className="mb-4 flex h-9 w-full items-center justify-center rounded-[8px] border border-line-strong bg-surface text-sm font-semibold text-ink hover:bg-sunken"
        >
          {state.data.sso.label}
        </a>
      )}
      {ssoMessage && <p className="mb-3 text-sm text-danger-text">{ssoMessage}</p>}
      {state.data?.sso.only && !ownerForm ? (
        <button className="t-meta text-accent" onClick={() => setOwnerForm(true)}>
          Owner sign-in
        </button>
      ) : (
        <form onSubmit={submit}>
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <div className="mb-3 text-right">
            <Link data-testid="login-forgot" to="/forgot-password" className="t-meta text-accent">
              Forgot password?
            </Link>
          </div>
          {error && <p className="mb-3 text-sm text-danger">{error}</p>}
          <Button type="submit" loading={saving} className="w-full">
            Sign in
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
