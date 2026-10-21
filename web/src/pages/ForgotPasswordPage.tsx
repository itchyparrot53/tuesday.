import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AuthState } from '../App';
import { AuthShell, Field } from './AuthShell';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';

export function ForgotPasswordPage() {
  const state = useQuery({
    queryKey: ['auth', 'state'],
    queryFn: () => api<AuthState>('GET', '/auth/state'),
    staleTime: 0,
  });
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api('POST', '/auth/forgot', { email });
      setSent(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link.">
      {state.data?.mail === false ? (
        <p className="text-sm text-muted">
          Email isn't set up on this Tuesday. Ask an admin to create a reset link for you.
        </p>
      ) : sent ? (
        <p className="text-sm text-ink">
          If an account exists for {email}, we've sent a reset link. It expires in 60 minutes.
        </p>
      ) : (
        <form onSubmit={submit}>
          <Field label="Email" htmlFor="forgot-email">
            <Input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </Field>
          <Button type="submit" loading={saving} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-4 text-sm">
        <Link to="/login" className="text-accent">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
