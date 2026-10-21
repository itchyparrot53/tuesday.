import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { AuthShell, Field } from './AuthShell';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function ResetPasswordPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const reset = useQuery({
    queryKey: ['reset', token],
    queryFn: () => api<{ email: string }>('GET', `/auth/reset/${token}`),
    retry: false,
  });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (reset.error) {
    const gone = reset.error instanceof ApiError && reset.error.status === 410;
    return (
      <AuthShell title="Reset password">
        <p className="text-sm text-muted">
          {gone ? 'This link has expired or was already used.' : 'This reset link is not valid.'}{' '}
          <Link to="/forgot-password" className="text-accent">
            Request a new one
          </Link>
          .
        </p>
      </AuthShell>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api('POST', '/auth/reset', { token, password });
      await qc.invalidateQueries({ queryKey: ['me'] });
      await qc.invalidateQueries({ queryKey: ['auth', 'state'] });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle={reset.data?.email ? `For ${reset.data.email}` : undefined}
    >
      <form onSubmit={submit}>
        <Field label="New password" htmlFor="new-password" hint="At least 8 characters.">
          <Input
            id="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
            autoFocus
          />
        </Field>
        <Field label="Confirm password" htmlFor="confirm-password">
          <Input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            minLength={8}
            required
          />
        </Field>
        {error && <p className="mb-3 text-sm text-danger-text">{error}</p>}
        <Button type="submit" loading={saving} className="w-full">
          Set new password
        </Button>
      </form>
    </AuthShell>
  );
}
